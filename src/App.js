import React, { useState, useEffect } from 'react';
import { useRef } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine
} from 'recharts';
// Simple Button for canvas use (replaces shadcn/ui)
const Button = ({ children, onClick, className = "", variant, size, ...props }) => (
  <button
    className={
      "rounded px-3 py-1 border " +
      (variant === "outline" ? "border-gray-400 bg-white" : "bg-blue-500 text-white") +
      (size === "sm" ? " text-xs py-0.5 px-2" : "") +
      " " + className
    }
    onClick={onClick}
    {...props}
  >
    {children}
  </button>
);

const FLUX_ONLY_SOLUTES = ['AA', 'Peptide', 'OA-', 'OC+'];

const WATER_EPSILON = 0.05;
const WATER_SOLUTE_FLUX_LIMIT = 5;
const WATER_DRIVE_SCALE = 0.5;
const CHARGE_EPSILON = 0.05;
const PARACELLULAR_TEP_DRIVE_MAX = 2;
const PARACELLULAR_TEP_SENSITIVITY = 1.5;
const PARACELLULAR_TEP_SOLVER_BOUND = 50;
const PARACELLULAR_TEP_SOLVER_ITERATIONS = 50;
const PARACELLULAR_HCO3_PERMEABILITY_SCALE = 0.1;
const ION_VALENCE = {
  'Na+': 1,
  'K+': 1,
  'Cl-': -1,
  'H+': 1,
  'HCO3-': -1,
  'Ca2+': 2,
  Phosphate: -2,
  'OA-': 0,
  'OC+': 0,
  AA: 0,
  Peptide: 0,
  Glucose: 0,
  H2O: 0
};

function tendencyStrength(value) {
  const magnitude = Math.abs(value);
  if (magnitude < WATER_EPSILON) return 'none';
  if (magnitude < 5) return 'weak';
  if (magnitude < 15) return 'moderate';
  return 'strong';
}

function waterTendencyStrength(value) {
  const magnitude = Math.abs(value);
  if (magnitude < WATER_EPSILON) return 'none';
  if (magnitude < 0.75) return 'weak';
  if (magnitude < 1.75) return 'moderate';
  return 'strong';
}

function epithelialWaterDirection(value) {
  if (Math.abs(value) < WATER_EPSILON) return 'neutral/weak';
  return value > 0 ? 'toward blood' : 'toward lumen';
}

function soluteLinkedWaterDrive(transepiFluxDataNoH2O) {
  const sourceFlux = transepiFluxDataNoH2O.reduce(
    (sum, row) => sum + Number(row.transepithelial || 0),
    0
  );
  const value = Math.abs(sourceFlux) < WATER_EPSILON
    ? 0
    : WATER_DRIVE_SCALE * Math.sign(sourceFlux) * Math.min(Math.abs(sourceFlux), WATER_SOLUTE_FLUX_LIMIT);
  return { sourceFlux, value };
}

function transepithelialWaterTendency(value, hasPathway, pathwayLabel, noPathwayDirection = 'no complete pathway') {
  if (!hasPathway) {
    return {
      label: pathwayLabel,
      direction: noPathwayDirection,
      strength: 'none',
      value: 0
    };
  }
  if (Math.abs(value) < WATER_EPSILON) {
    return {
      label: pathwayLabel,
      direction: 'neutral/weak',
      strength: 'none',
      value
    };
  }
  return {
    label: pathwayLabel,
    direction: epithelialWaterDirection(value),
    strength: waterTendencyStrength(value),
    value
  };
}

function chargeStrength(value) {
  const magnitude = Math.abs(value);
  if (magnitude < CHARGE_EPSILON) return 'none';
  if (magnitude < 0.5) return 'weak';
  if (magnitude < 1.5) return 'moderate';
  return 'strong';
}

function chargeSum(fluxes) {
  return Object.entries(fluxes)
    .reduce((sum, [ion, flux]) => sum + (ION_VALENCE[ion] ?? 0) * flux, 0);
}

function transepithelialChargeSum(transepiFluxData) {
  return transepiFluxData
    .filter(row => row.ion !== 'H2O')
    .reduce((sum, row) => sum + (ION_VALENCE[row.ion] ?? 0) * row.transepithelial, 0);
}

function transepithelialPotentialValue(transepiFluxData) {
  return -transepithelialChargeSum(transepiFluxData);
}

function cellPolarityDirection(value) {
  if (Math.abs(value) < CHARGE_EPSILON) return 'no strong net tendency';
  return value > 0 ? 'cell tends positive' : 'cell tends negative';
}

function epithelialPolarityDirection(value) {
  if (Math.abs(value) < CHARGE_EPSILON) return 'no strong net tendency';
  return value > 0 ? 'lumen tends positive relative to blood' : 'lumen tends negative relative to blood';
}

function paracellularElectrochemicalDrive(ion, apicalConcentration, basolateralConcentration, transepithelialElectricalTendency) {
  const chemicalDrive = Number(apicalConcentration ?? 0) - Number(basolateralConcentration ?? 0);
  const electricalTendency = Number(transepithelialElectricalTendency || 0);
  const valence = ION_VALENCE[ion] || 0;
  if (valence === 0) return chemicalDrive;
  const boundedTep = Math.tanh(electricalTendency / PARACELLULAR_TEP_SENSITIVITY);
  const electricalDrive = valence * boundedTep * PARACELLULAR_TEP_DRIVE_MAX;
  return chemicalDrive + electricalDrive;
}

function paracellularPermeantIonConfigs(paracellularType, cationPerm, anionPerm) {
  if (paracellularType === 'cation') {
    return ['Na+','K+']
      .map(ion => ({ ion, permeability: Math.max(Number(cationPerm) || 0, 0) }))
      .filter(config => config.permeability > 0);
  }
  if (paracellularType === 'anion') {
    return ['Cl-','HCO3-']
      .map(ion => ({
        ion,
        permeability: Math.max(Number(anionPerm) || 0, 0) *
          (ion === 'HCO3-' ? PARACELLULAR_HCO3_PERMEABILITY_SCALE : 1)
      }))
      .filter(config => config.permeability > 0);
  }
  return [];
}

function paracellularFluxesForElectricalTendency(ionConfigs, apicalSurface, basolateralSurface, electricalTendency) {
  return ionConfigs.reduce((fluxes, { ion, permeability }) => {
    fluxes[ion] = permeability * paracellularElectrochemicalDrive(
      ion,
      apicalSurface[ion],
      basolateralSurface[ion],
      electricalTendency
    );
    return fluxes;
  }, {});
}

function paracellularElectricalResidual(electricalTendency, transepiFluxDataNoH2O, ionConfigs, apicalSurface, basolateralSurface) {
  const candidateParaFlux = paracellularFluxesForElectricalTendency(
    ionConfigs,
    apicalSurface,
    basolateralSurface,
    electricalTendency
  );
  const combinedCharge = transepiFluxDataNoH2O
    .filter(row => row.ion !== 'H2O')
    .reduce((sum, row) => {
      const valence = ION_VALENCE[row.ion] || 0;
      return sum + valence * (Number(row.transepithelial || 0) + Number(candidateParaFlux[row.ion] || 0));
    }, 0);
  return electricalTendency + combinedCharge;
}

function solveParacellularElectricalTendency(transepiFluxDataNoH2O, ionConfigs, apicalSurface, basolateralSurface) {
  if (!ionConfigs.length) return transepithelialPotentialValue(transepiFluxDataNoH2O);

  // Paracellular current shunts the voltage that drives it, so solve for the final TEP.
  let lower = -PARACELLULAR_TEP_SOLVER_BOUND;
  let upper = PARACELLULAR_TEP_SOLVER_BOUND;
  const lowerResidual = paracellularElectricalResidual(
    lower,
    transepiFluxDataNoH2O,
    ionConfigs,
    apicalSurface,
    basolateralSurface
  );
  const upperResidual = paracellularElectricalResidual(
    upper,
    transepiFluxDataNoH2O,
    ionConfigs,
    apicalSurface,
    basolateralSurface
  );

  if (lowerResidual > 0 || upperResidual < 0) {
    return transepithelialPotentialValue(transepiFluxDataNoH2O);
  }

  for (let i = 0; i < PARACELLULAR_TEP_SOLVER_ITERATIONS; i += 1) {
    const mid = (lower + upper) / 2;
    const residual = paracellularElectricalResidual(
      mid,
      transepiFluxDataNoH2O,
      ionConfigs,
      apicalSurface,
      basolateralSurface
    );
    if (Math.abs(residual) < 1e-6) return mid;
    if (residual > 0) {
      upper = mid;
    } else {
      lower = mid;
    }
  }

  return (lower + upper) / 2;
}

function buildChargeReport(apicalFlux, basolateralFlux, transepiFluxData, localTepOffset = 0) {
  const apicalCharge = chargeSum(apicalFlux);
  const basolateralCharge = chargeSum(basolateralFlux);
  const cellCharge = apicalCharge + basolateralCharge;
  const transepithelialPotential = transepithelialPotentialValue(transepiFluxData) + localTepOffset;

  return {
    apical: {
      label: 'Apical membrane',
      direction: cellPolarityDirection(apicalCharge),
      strength: chargeStrength(apicalCharge),
      value: apicalCharge
    },
    basolateral: {
      label: 'Basolateral membrane',
      direction: cellPolarityDirection(basolateralCharge),
      strength: chargeStrength(basolateralCharge),
      value: basolateralCharge
    },
    cell: {
      label: 'Cell net polarity',
      direction: cellPolarityDirection(cellCharge),
      strength: chargeStrength(cellCharge),
      value: cellCharge
    },
    transepithelial: {
      label: 'Transepithelial Potential',
      direction: epithelialPolarityDirection(transepithelialPotential),
      strength: chargeStrength(transepithelialPotential),
      value: transepithelialPotential
    }
  };
}

function aqpDensityForPlacement(tList, placement) {
  return tList
    .filter(t => t.id === 'AQP' && t.placement === placement)
    .reduce((sum, t) => sum + Math.max(Number(t.density) || 0, 0), 0);
}

function serialAqpDensityScale(apicalDensity, basolateralDensity) {
  if (apicalDensity <= 0 || basolateralDensity <= 0) return 0;
  return (2 * apicalDensity * basolateralDensity) / (apicalDensity + basolateralDensity);
}

function buildWaterReport(tList, paracellularType, transepiFluxDataNoH2O, backgroundOsmoticPull) {
  const apicalAqpDensity = aqpDensityForPlacement(tList, 'apical');
  const basolateralAqpDensity = aqpDensityForPlacement(tList, 'basolateral');
  const aqpDensityScale = serialAqpDensityScale(apicalAqpDensity, basolateralAqpDensity);
  const apicalWaterPath = apicalAqpDensity > 0;
  const basolateralWaterPath = basolateralAqpDensity > 0;
  const hasTranscellularPath = apicalWaterPath && basolateralWaterPath;
  const hasParacellularPath = paracellularType === 'cation';
  const transcellularPathStatus = hasTranscellularPath
    ? 'complete AQP path; AQP density scale ' + aqpDensityScale.toFixed(2)
    : apicalWaterPath || basolateralWaterPath
      ? 'incomplete AQP path'
      : 'none';
  const paracellularPathStatus = hasParacellularPath ? 'present' : 'none';
  const soluteDrive = soluteLinkedWaterDrive(transepiFluxDataNoH2O);
  const backgroundValue = Number(backgroundOsmoticPull?.value || 0);
  const osmoticPullValue = soluteDrive.value + backgroundValue;
  const expressedPathwayCount = (hasTranscellularPath ? 1 : 0) + (hasParacellularPath ? 1 : 0);
  const pathwayShare = expressedPathwayCount > 0 ? 1 / expressedPathwayCount : 0;
  const transcellularValue = hasTranscellularPath ? osmoticPullValue * pathwayShare * aqpDensityScale : 0;
  const paracellularValue = hasParacellularPath ? osmoticPullValue * pathwayShare : 0;
  const netTransepithelialValue = transcellularValue + paracellularValue;

  return {
    osmoticPull: {
      label: 'Osmotic pull',
      direction: epithelialWaterDirection(osmoticPullValue),
      strength: waterTendencyStrength(osmoticPullValue),
      value: osmoticPullValue,
      soluteValue: soluteDrive.value,
      backgroundValue,
      sourceFlux: soluteDrive.sourceFlux
    },
    backgroundPull: {
      label: 'Background osmotic pull',
      status: backgroundOsmoticPull?.status || 'None',
      direction: epithelialWaterDirection(backgroundValue),
      strength: waterTendencyStrength(backgroundValue),
      value: backgroundValue,
      setting: backgroundOsmoticPull?.setting || 'none',
      effectiveLevel: backgroundOsmoticPull?.effectiveLevel || 'none',
      effectiveLabel: backgroundOsmoticPull?.effectiveLabel || 'None'
    },
    transcellularPath: {
      label: 'Transcellular water pathway',
      status: transcellularPathStatus,
      apicalDensity: apicalAqpDensity,
      basolateralDensity: basolateralAqpDensity,
      densityScale: aqpDensityScale,
      note: hasTranscellularPath
        ? 'AQP is present on both apical and basolateral membranes; apical density ' + apicalAqpDensity.toFixed(1) + ', basolateral density ' + basolateralAqpDensity.toFixed(1)
        : apicalWaterPath || basolateralWaterPath
          ? 'AQP is present on only one membrane'
          : 'No AQP water pathway is placed'
    },
    paracellularPath: {
      label: 'Paracellular water pathway',
      status: paracellularPathStatus,
      note: hasParacellularPath
        ? 'Cation + Water Pore provides a paracellular water pathway'
        : 'Barrier and Anion Pore do not provide a water pathway'
    },
    transcellular: transepithelialWaterTendency(transcellularValue, hasTranscellularPath, 'Transcellular water contribution', transcellularPathStatus),
    paracellular: transepithelialWaterTendency(paracellularValue, hasParacellularPath, 'Paracellular water contribution', 'no paracellular water pathway'),
    netTransepithelial: transepithelialWaterTendency(netTransepithelialValue, hasTranscellularPath || hasParacellularPath, 'Net epithelial water flux', 'no water pathway')
  };
}

const INITIAL_TRANSPORTERS = [
  { id: 'AQP',      name: 'AQP',        type: 'channel',    stoich: { 'H2O': 1 },            kinetics: { maxRate: 1.0, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'AE1',      name: 'CBE',        type: 'antiporter', stoich: { 'Cl-': 1, 'HCO3-': -1 }, kinetics: { maxRate: 0.7, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'AAFacilitator', name: 'AA facilitator', type: 'carrier', stoich: { AA: -1 }, kinetics: { maxRate: 0.7, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'PiFacilitator', name: 'Pi Facilitator', type: 'carrier', stoich: { Phosphate: -1 }, kinetics: { maxRate: 0.6, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'CFTR',     name: 'CFTR',       type: 'channel',    stoich: { 'Cl-': -1, 'HCO3-': -0.5 }, kinetics: { maxRate: 0.8, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'ClCKb',    name: 'ClC',        type: 'channel',    stoich: { 'Cl-': -1 },           kinetics: { maxRate: 0.7, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'ENaC',     name: 'ENaC',       type: 'channel',    stoich: { 'Na+': 1 },            kinetics: { maxRate: 1.0, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'GLUT2',    name: 'GLUT',       type: 'channel',    stoich: { 'Glucose': -1 },      kinetics: { maxRate: 1.0, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'TRPV56',   name: 'TRPV5/6',    type: 'channel',    stoich: { 'Ca2+': 1 },          kinetics: { maxRate: 0.6, Km: 0.8 }, placement: 'none', density: 1 },
  { id: 'HATPase',  name: 'H⁺-ATPase',  type: 'pump',       stoich: { 'H+': -1 },           kinetics: { maxRate: 0.9, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'HKATPase', name: 'H⁺/K⁺-ATPase', type: 'pump', stoich: { 'H+': -1, 'K+': 1 }, kinetics: { maxRate: 0.8, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'NaPi2',    name: 'NaPi 2:1',   type: 'symporter',  stoich: { 'Na+': 2, 'Phosphate': 1 }, kinetics: { maxRate: 0.6, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'NaPi',     name: 'NaPi 3:1',   type: 'symporter',  stoich: { 'Na+': 3, 'Phosphate': 1 }, kinetics: { maxRate: 0.6, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'NBCe1',    name: 'NBC',        type: 'symporter',  stoich: { 'Na+': 1, 'HCO3-': 3 }, kinetics: { maxRate: 0.7, Km: 2.0 }, placement: 'none', density: 1 },
  { id: 'NCC',      name: 'NCC',        type: 'symporter',  stoich: { 'Na+': 1, 'Cl-': 1 },  kinetics: { maxRate: 0.6, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'NCX1',     name: 'NCX1',       type: 'exchanger',  stoich: { 'Na+': 3, 'Ca2+': -1 }, kinetics: { maxRate: 0.4, Km: 0.2 }, placement: 'none', density: 1 },
  { id: 'NHE3',     name: 'NHE3',       type: 'antiporter', stoich: { 'Na+': 1, 'H+': -1 },  kinetics: { maxRate: 1.0, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'NKCC',     name: 'NKCC',       type: 'symporter',  stoich: { 'Na+': 1, 'K+': 1, 'Cl-': 2 }, kinetics: { maxRate: 0.5, Km: 0.5 }, placement: 'none', density: 1 },
  { id: 'NaKATPase',name: 'Na⁺/K⁺-ATPase',type: 'pump',       stoich: { 'Na+': -3, 'K+': 2 }, kinetics: { maxRate: 1.2, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'NaAA',     name: 'Na⁺-AA',     type: 'symporter',  stoich: { 'Na+': 1, AA: 1 },    kinetics: { maxRate: 0.7, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'OAT',      name: 'OAT',        type: 'carrier',    stoich: { 'OA-': 1 },           kinetics: { maxRate: 0.7, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'OCT',      name: 'OCT',        type: 'carrier',    stoich: { 'OC+': 1 },           kinetics: { maxRate: 0.7, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'PMCA',     name: 'PMCA',       type: 'pump',       stoich: { 'Ca2+': -1 },         kinetics: { maxRate: 0.3, Km: 0.5 }, placement: 'none', density: 1 },
  { id: 'MATE',     name: 'MATE',       type: 'antiporter', stoich: { 'OC+': -1, 'H+': 1 }, kinetics: { maxRate: 0.7, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'MRPBCRP',  name: 'MRP/BCRP',   type: 'carrier',    stoich: { 'OA-': -1 },          kinetics: { maxRate: 0.7, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'PepT',     name: 'PepT',       type: 'symporter',  stoich: { Peptide: 1, 'H+': 1 }, kinetics: { maxRate: 0.7, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'ROMK',     name: 'Kir',        type: 'channel',    stoich: { 'K+': -1 },           kinetics: { maxRate: 1.0, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'SGLT',     name: 'SGLT',       type: 'symporter',  stoich: { 'Na+': 1, 'Glucose': 1 }, kinetics: { maxRate: 0.8, Km: 1.5 }, placement: 'none', density: 1 }
];

const TRANSPORTER_ID_ALIASES = {
  CBE: 'AE1',
  Pendrin: 'AE1',
  GLUT: 'GLUT2',
  NBC: 'NBCe1'
};

function canonicalTransporterId(id) {
  return TRANSPORTER_ID_ALIASES[id] || id;
}

const TRANSPORTER_GROUPS = [
  { label: 'Channels', ids: ['AQP', 'CFTR', 'ClCKb', 'ENaC', 'ROMK', 'TRPV56'] },
  { label: 'Cotransporters', ids: ['NaAA', 'NaPi2', 'NaPi', 'NBCe1', 'NCC', 'NKCC', 'PepT', 'SGLT'] },
  { label: 'Exchangers', ids: ['AE1', 'NCX1', 'NHE3'] },
  { label: 'Facilitators', ids: ['GLUT2', 'PiFacilitator'] },
  { label: 'Organic Solute Carriers', ids: ['AAFacilitator', 'MATE', 'MRPBCRP', 'OAT', 'OCT'] },
  { label: 'Pumps', ids: ['HATPase', 'HKATPase', 'NaKATPase', 'PMCA'] }
];

const TISSUE_OPTIONS = [
  {
    value: 'all',
    label: 'All transporters',
    transporterIds: INITIAL_TRANSPORTERS.map(t => t.id)
  },
  {
    value: 'proximal-tubule',
    label: 'Renal proximal tubule',
    group: 'Kidney and urinary tract',
    transporterIds: ['AQP', 'SGLT', 'NaPi2', 'NaPi', 'PiFacilitator', 'NHE3', 'NBCe1', 'GLUT2', 'NaKATPase', 'PMCA', 'NCX1', 'NaAA', 'AAFacilitator', 'PepT', 'OAT', 'MRPBCRP', 'OCT', 'MATE']
  },
  {
    value: 'thick-ascending-limb',
    label: 'Thick ascending limb',
    group: 'Kidney and urinary tract',
    transporterIds: ['NKCC', 'ROMK', 'ClCKb', 'NaKATPase']
  },
  {
    value: 'distal-convoluted-tubule',
    label: 'Distal convoluted tubule',
    group: 'Kidney and urinary tract',
    transporterIds: ['TRPV56', 'NCC', 'ClCKb', 'NaKATPase', 'PMCA', 'NCX1']
  },
  {
    value: 'connecting-tubule',
    label: 'Connecting tubule / CNT',
    group: 'Kidney and urinary tract',
    transporterIds: ['AQP', 'TRPV56', 'ENaC', 'ROMK', 'NaKATPase', 'PMCA', 'NCX1']
  },
  {
    value: 'collecting-duct-principal',
    label: 'Collecting duct principal cell',
    group: 'Kidney and urinary tract',
    transporterIds: ['AQP', 'ENaC', 'ROMK', 'NaKATPase']
  },
  {
    value: 'collecting-duct-alpha',
    label: 'Alpha-intercalated cell',
    group: 'Kidney and urinary tract',
    transporterIds: ['HATPase', 'HKATPase', 'AE1', 'ClCKb']
  },
  {
    value: 'collecting-duct-beta',
    label: 'Beta-intercalated cell',
    group: 'Kidney and urinary tract',
    transporterIds: ['AE1', 'HATPase', 'ClCKb']
  },
  {
    value: 'gastric-parietal',
    label: 'Gastric parietal cell',
    group: 'Gastrointestinal and hepatobiliary',
    transporterIds: ['HKATPase', 'ClCKb', 'AE1', 'NaKATPase', 'ROMK']
  },
  {
    value: 'small-intestine',
    label: 'Small intestine',
    group: 'Gastrointestinal and hepatobiliary',
    transporterIds: ['AQP', 'SGLT', 'GLUT2', 'TRPV56', 'NHE3', 'NaKATPase', 'ClCKb', 'NaAA', 'AAFacilitator', 'PepT', 'OCT', 'MATE', 'PMCA', 'NCX1']
  },
  {
    value: 'small-intestine-crypt',
    label: 'Small intestinal crypt / secretory epithelium',
    group: 'Gastrointestinal and hepatobiliary',
    transporterIds: ['AQP', 'CFTR', 'NKCC', 'ROMK', 'NaKATPase', 'ClCKb', 'NHE3']
  },
  {
    value: 'colon-absorptive',
    label: 'Colon absorptive epithelium',
    group: 'Gastrointestinal and hepatobiliary',
    transporterIds: ['AQP', 'ENaC', 'NHE3', 'NaKATPase', 'ClCKb', 'AE1', 'HATPase']
  },
  {
    value: 'gallbladder',
    label: 'Gallbladder epithelium',
    group: 'Gastrointestinal and hepatobiliary',
    transporterIds: ['AQP', 'CFTR', 'NHE3', 'ClCKb', 'AE1', 'NaKATPase']
  },
  {
    value: 'pancreatic-duct',
    label: 'Pancreatic duct',
    group: 'Exocrine, airway, and skin',
    transporterIds: ['AQP', 'CFTR', 'NBCe1', 'AE1', 'ClCKb', 'NHE3', 'NaKATPase', 'HATPase']
  },
  {
    value: 'salivary-duct',
    label: 'Salivary duct',
    group: 'Exocrine, airway, and skin',
    transporterIds: ['ENaC', 'ROMK', 'CFTR', 'ClCKb', 'AE1', 'NBCe1', 'NaKATPase']
  },
  {
    value: 'airway-surface',
    label: 'Airway surface epithelium',
    group: 'Exocrine, airway, and skin',
    transporterIds: ['AQP', 'CFTR', 'ENaC', 'ClCKb', 'NaKATPase', 'AE1']
  },
  {
    value: 'sweat-duct',
    label: 'Sweat duct',
    group: 'Exocrine, airway, and skin',
    transporterIds: ['CFTR', 'ENaC', 'ClCKb', 'NaKATPase']
  },
  {
    value: 'choroid-plexus',
    label: 'Choroid plexus epithelium',
    group: 'Central nervous system',
    transporterIds: ['AQP', 'CFTR', 'NKCC', 'NBCe1', 'ClCKb', 'NHE3', 'NaKATPase']
  },
  {
    value: 'placenta-syncytiotrophoblast',
    label: 'Placenta / syncytiotrophoblast exchange',
    group: 'Reproductive system',
    orientation: 'placenta',
    transporterIds: ['AQP', 'GLUT2', 'NaKATPase', 'NaAA', 'AAFacilitator', 'TRPV56', 'PMCA', 'NCX1', 'CFTR', 'OAT', 'MRPBCRP', 'OCT', 'MATE']
  }
];

const TISSUE_OPTION_GROUPS = [
  'Kidney and urinary tract',
  'Gastrointestinal and hepatobiliary',
  'Exocrine, airway, and skin',
  'Central nervous system',
  'Reproductive system'
];
const HIDDEN_TISSUE_OPTION_VALUES = new Set([
  'airway-surface',
  'choroid-plexus',
  'placenta-syncytiotrophoblast'
]);
const isSelectableTissueOption = option => option.value === 'all' || !HIDDEN_TISSUE_OPTION_VALUES.has(option.value);
const TISSUE_LIMITATION_NOTES = {};
const TISSUE_LIMITATION_SYMBOL = '⚠';
const hasTissueLimitation = optionOrValue => {
  const value = typeof optionOrValue === 'string' ? optionOrValue : optionOrValue?.value;
  return Boolean(TISSUE_LIMITATION_NOTES[value]);
};
const tissueOptionDisplayLabel = option => option.label + (hasTissueLimitation(option) ? ' ' + TISSUE_LIMITATION_SYMBOL : '');

const APP_MODE_OPTIONS = [
  { value: 'explore', label: 'Explore' },
  { value: 'demo', label: 'Instructor Demo' }
];

// Set REACT_APP_ENABLE_INSTRUCTOR_DEMO_MODE=false for student-facing builds.
const ENABLE_INSTRUCTOR_DEMO_MODE = process.env.REACT_APP_ENABLE_INSTRUCTOR_DEMO_MODE !== 'false';

// Teaching-level presets constrained by SALT's simplified transporter and paracellular choices.
const TISSUE_DEMO_PRESETS = {
  all: {
    paracellularType: 'none',
    placements: {}
  },
  'proximal-tubule': {
    paracellularType: 'cation',
    placements: {
      apical: ['AQP', 'SGLT', 'NaPi2', 'NaPi', 'NHE3', 'NaAA', 'PepT', 'MRPBCRP', 'MATE'],
      basolateral: ['AQP', 'PiFacilitator', 'NBCe1', 'GLUT2', 'NaKATPase', 'PMCA', 'NCX1', 'AAFacilitator', 'OAT', 'OCT']
    }
  },
  'thick-ascending-limb': {
    paracellularType: 'none',
    placements: {
      apical: ['NKCC', 'ROMK'],
      basolateral: ['ClCKb', 'NaKATPase']
    }
  },
  'distal-convoluted-tubule': {
    paracellularType: 'none',
    placements: {
      apical: ['TRPV56', 'NCC'],
      basolateral: ['ClCKb', 'NaKATPase', 'PMCA', 'NCX1']
    }
  },
  'connecting-tubule': {
    paracellularType: 'none',
    placements: {
      apical: ['AQP', 'TRPV56', 'ENaC', 'ROMK'],
      basolateral: ['AQP', 'NaKATPase', 'PMCA', 'NCX1']
    }
  },
  'collecting-duct-principal': {
    paracellularType: 'none',
    placements: {
      apical: ['AQP', 'ENaC', 'ROMK'],
      basolateral: ['AQP', 'NaKATPase']
    }
  },
  'collecting-duct-alpha': {
    paracellularType: 'none',
    placements: {
      apical: ['HATPase', 'HKATPase'],
      basolateral: ['AE1', 'ClCKb']
    }
  },
  'collecting-duct-beta': {
    paracellularType: 'none',
    placements: {
      apical: ['AE1'],
      basolateral: ['HATPase', 'ClCKb']
    }
  },
  'gastric-parietal': {
    paracellularType: 'none',
    placements: {
      apical: ['HKATPase', 'ClCKb', 'ROMK'],
      basolateral: ['AE1', 'NaKATPase']
    }
  },
  'small-intestine': {
    paracellularType: 'cation',
    placements: {
      apical: ['AQP', 'SGLT', 'TRPV56', 'NHE3', 'NaAA', 'PepT', 'MATE'],
      basolateral: ['AQP', 'GLUT2', 'NaKATPase', 'ClCKb', 'AAFacilitator', 'OCT', 'PMCA', 'NCX1']
    }
  },
  'small-intestine-crypt': {
    paracellularType: 'cation',
    placements: {
      apical: ['AQP', { id: 'CFTR', density: 2 }],
      basolateral: ['AQP', 'NKCC', 'ROMK', 'NaKATPase', 'ClCKb']
    }
  },
  'colon-absorptive': {
    paracellularType: 'anion',
    placements: {
      apical: ['AQP', 'ENaC', 'NHE3', 'AE1', 'HATPase'],
      basolateral: ['AQP', 'NaKATPase', 'ClCKb']
    }
  },
  gallbladder: {
    paracellularType: 'cation',
    placements: {
      apical: ['AQP', 'CFTR', 'NHE3', 'AE1'],
      basolateral: ['AQP', 'ClCKb', 'NaKATPase']
    }
  },
  'pancreatic-duct': {
    paracellularType: 'cation',
    placements: {
      apical: ['AQP', { id: 'CFTR', density: 2 }, 'AE1', { id: 'NHE3', density: 0.5 }],
      basolateral: ['AQP', 'NBCe1', { id: 'ClCKb', density: 2 }, 'NaKATPase', 'HATPase']
    }
  },
  'salivary-duct': {
    paracellularType: 'none',
    placements: {
      apical: ['ENaC', 'ROMK', 'CFTR', 'AE1'],
      basolateral: ['ClCKb', 'NaKATPase', 'NBCe1']
    }
  },
  'airway-surface': {
    paracellularType: 'cation',
    placements: {
      apical: ['AQP', 'CFTR', 'ENaC', 'AE1'],
      basolateral: ['AQP', 'ClCKb', 'NaKATPase']
    }
  },
  'sweat-duct': {
    paracellularType: 'none',
    placements: {
      apical: ['CFTR', 'ENaC'],
      basolateral: ['ClCKb', 'NaKATPase']
    }
  },
  'choroid-plexus': {
    paracellularType: 'cation',
    placements: {
      apical: ['AQP', 'CFTR', 'NKCC', 'NaKATPase'],
      basolateral: ['AQP', 'NBCe1', 'ClCKb', 'NHE3']
    }
  },
  'placenta-syncytiotrophoblast': {
    paracellularType: 'none',
    placements: {
      apical: ['AQP', 'GLUT2', 'NaAA', 'TRPV56', 'CFTR', 'MRPBCRP', 'MATE'],
      basolateral: ['AQP', 'GLUT2', 'NaKATPase', 'AAFacilitator', 'PMCA', 'NCX1', 'OAT', 'OCT']
    }
  }
};

const DISPLAY_ORIENTATIONS = {
  epithelial: {
    apicalLabel: 'Apical / lumen side',
    basolateralLabel: 'Basolateral / blood side',
    positiveFluxLabel: 'toward blood',
    negativeFluxLabel: 'toward lumen',
    positiveProcessLabel: 'absorption',
    negativeProcessLabel: 'secretion',
    apicalMembraneLabel: 'Apical membrane',
    basolateralMembraneLabel: 'Basolateral membrane',
    apicalShortLabel: 'Apical',
    basolateralShortLabel: 'Basolateral',
    apicalPolarityLabel: 'Lumen',
    basolateralPolarityLabel: 'Blood'
  },
  placenta: {
    apicalLabel: 'Maternal side',
    basolateralLabel: 'Fetal side',
    positiveFluxLabel: 'toward fetus',
    negativeFluxLabel: 'toward mother',
    positiveProcessLabel: 'maternal-to-fetal transfer',
    negativeProcessLabel: 'fetal-to-maternal transfer',
    apicalMembraneLabel: 'Maternal-side membrane',
    basolateralMembraneLabel: 'Fetal-side membrane',
    apicalShortLabel: 'Maternal',
    basolateralShortLabel: 'Fetal',
    apicalPolarityLabel: 'Maternal',
    basolateralPolarityLabel: 'Fetal'
  }
};

function displayOrientationForTissue(tissueOption) {
  return DISPLAY_ORIENTATIONS[tissueOption?.orientation] || DISPLAY_ORIENTATIONS.epithelial;
}

const BACKGROUND_OSMOTIC_PULL_VALUES = {
  none: 0,
  low: 0.35,
  normal: 0.9,
  high: 1.8
};

const BACKGROUND_OSMOTIC_PULL_OPTIONS = [
  { value: 'tissue', label: 'Use tissue default' },
  { value: 'none', label: 'Equal / no background pull' },
  { value: 'low', label: 'Weak toward blood' },
  { value: 'normal', label: 'Moderate toward blood' },
  { value: 'high', label: 'Strong toward blood' }
];

function backgroundOsmoticPullLevelLabel(level) {
  const option = BACKGROUND_OSMOTIC_PULL_OPTIONS.find(candidate => candidate.value === level);
  return option?.label || 'None';
}

function backgroundOsmoticPullPhrase(level) {
  return backgroundOsmoticPullLevelLabel(level);
}

function tissueDefaultBackgroundOsmoticPullLevel(tissuePreset) {
  const tissue = TISSUE_OPTIONS.find(option => option.value === tissuePreset) || TISSUE_OPTIONS[0];
  const tissueText = (tissue.value + ' ' + tissue.label).toLowerCase();
  if (tissue.value === 'all') return 'none';
  if (tissueText.includes('descending limb') || tissueText.includes('thin descending')) return 'high';
  if (tissueText.includes('collecting duct principal')) return 'normal';
  if (tissueText.includes('collecting duct') && !tissueText.includes('intercalated')) return 'normal';
  if (tissueText.includes('thick ascending limb')) return 'normal';
  return 'none';
}

function resolveBackgroundOsmoticPull(tissuePreset, setting) {
  const requestedLevel = setting || 'tissue';
  const tissueDefaultLevel = tissueDefaultBackgroundOsmoticPullLevel(tissuePreset);
  const effectiveLevel = requestedLevel === 'tissue' ? tissueDefaultLevel : requestedLevel;
  const value = BACKGROUND_OSMOTIC_PULL_VALUES[effectiveLevel] ?? 0;
  const status = requestedLevel === 'tissue'
    ? 'Tissue default, ' + backgroundOsmoticPullPhrase(effectiveLevel)
    : backgroundOsmoticPullPhrase(effectiveLevel);
  return {
    setting: requestedLevel,
    settingLabel: backgroundOsmoticPullLevelLabel(requestedLevel),
    tissueDefaultLevel,
    effectiveLevel,
    effectiveLabel: backgroundOsmoticPullPhrase(effectiveLevel),
    status,
    value
  };
}

const DENSITY_OPTIONS = [
  { label: 'Low', value: 0.5 },
  { label: 'Normal', value: 1 },
  { label: 'High', value: 2 }
];

function createTransporterUid(id, placement) {
  return id + '-' + placement + '-' + Date.now() + '-' + Math.random().toString(36).slice(2);
}

function createTransporterInstance(id, placement, density = 1) {
  const canonicalId = canonicalTransporterId(id);
  const template = INITIAL_TRANSPORTERS.find(t => t.id === canonicalId);
  if (!template) return null;
  return {
    ...template,
    kinetics: { ...template.kinetics },
    placement,
    density,
    uid: createTransporterUid(canonicalId, placement)
  };
}

function normalizeDemoTransporterEntry(entry) {
  return typeof entry === 'string' ? { id: entry } : entry;
}

function demoTransportersForTissue(tissuePreset) {
  const preset = TISSUE_DEMO_PRESETS[tissuePreset] || TISSUE_DEMO_PRESETS.all;
  return Object.entries(preset.placements || {})
    .flatMap(([placement, ids]) =>
      ids
        .map(normalizeDemoTransporterEntry)
        .map(entry => createTransporterInstance(entry.id, placement, entry.density ?? 1))
        .filter(Boolean)
    );
}

const TRANSPORTER_DESCRIPTIONS = {
  AE1: 'Chloride-bicarbonate exchanger class: moves 1 Cl- and 1 HCO3- in opposite directions. Includes AE1/2, pendrin, DRA/SLC26A3, and SLC26A6/PAT-1 examples.',
  AAFacilitator: 'AA facilitator: generic facilitated neutral amino acid transporter.',
  PiFacilitator: 'Pi Facilitator: generic facilitated inorganic phosphate transporter.',
  AQP: 'Aquaporin water channel class: supports H2O movement when apical and basolateral AQP form a complete pathway. Includes AQP2, AQP3, AQP4.',
  CFTR: 'Cystic fibrosis transmembrane conductance regulator: passive Cl- and HCO3- flux.',
  ClCKb: 'ClC chloride channel class: passive Cl- flux. Includes ClC-K.',
  ENaC: 'Epithelial Na+ channel: passive Na+ flux.',
  GLUT2: 'Glucose transporter class: passive glucose flux follows the glucose gradient. Includes GLUT1/GLUT2 examples.',
  TRPV56: 'TRPV5/6 Ca2+ channel class: passive Ca2+ flux with reduced teaching conductance; SALT does not model dynamic inhibition by intracellular Ca2+.',
  HATPase: 'Proton-ATPase: moves 1 H+ out per ATP.',
  HKATPase: 'Proton-potassium ATPase: moves 1 H+ out and 1 K+ in per ATP.',
  NaPi2: 'NaPi 2:1: sodium-phosphate cotransporter; moves 2 Na+ with 1 Pi. Electroneutral; represents NaPi-IIc.',
  NaPi: 'NaPi 3:1: sodium-phosphate cotransporter; moves 3 Na+ with 1 Pi. Electrogenic; represents NaPi-IIa/IIb.',
  NaAA: 'Na+-AA cotransporter: moves 1 Na+ and 1 neutral amino acid together.',
  NBCe1: 'Sodium-bicarbonate cotransporter class: moves 1 Na+ and 2 HCO3- together. Includes NBCe1.',
  NCC: 'Sodium-chloride cotransporter class: moves 1 Na+ and 1 Cl- together.',
  NCX1: 'Sodium-calcium exchanger: exchanges 3 Na+ and 1 Ca2+ in opposite directions.',
  NHE3: 'Sodium-hydrogen exchanger: exchanges 1 Na+ and 1 H+ in opposite directions.',
  NKCC: 'Na-K-Cl cotransporter class: moves 1 Na+, 1 K+, and 2 Cl- together. Includes NKCC1 and NKCC2.',
  NaKATPase: 'Sodium-potassium pump: moves 3 Na+ out and 2 K+ in per ATP.',
  OAT: 'Organic anion transporter class: tertiary-active OA- exchange. Requires Na+/K+-ATPase support; SALT does not model the exchanged dicarboxylate.',
  OCT: 'Organic cation transporter class: facilitated OC+ movement.',
  PMCA: 'Plasma membrane calcium ATPase: moves 1 Ca2+ out per ATP.',
  MATE: 'Multidrug and toxin extrusion transporter class: exchanges 1 organic cation and 1 H+ in opposite directions.',
  MRPBCRP: 'MRP (multidrug resistance-associated protein) and BCRP (breast cancer resistance protein) transporter class: pumps organic anions out using ATP.',
  PepT: 'PepT peptide transporter class: moves 1 H+ and 1 small peptide together. Includes PepT1 and PepT2.',
  ROMK: 'Kir potassium channel class: passive K+ flux. Includes ROMK.',
  SGLT: 'Sodium-glucose-linked transporter class: moves 1 Na+ and 1 glucose together. Includes SGLT1 and SGLT2.'
};

const INITIAL_CONCENTRATIONS = {
  apicalECF:     { 'Na+':145, 'K+':4,   'Cl-':105, 'H+':0.00004, 'HCO3-':24, 'Ca2+':1.2, Phosphate:1.0, 'Glucose':5,  'H2O':100 },
  icf:           { 'Na+':12,  'K+':140, 'Cl-':10,  'H+':0.00002, 'HCO3-':10, 'Ca2+':0.0001, Phosphate:1.0, 'Glucose':1,  'H2O':100 },
  basolateralECF:{ 'Na+':145, 'K+':4,   'Cl-':105, 'H+':0.00004, 'HCO3-':24, 'Ca2+':1.2, Phosphate:1.0, 'Glucose':5,  'H2O':100 }
};

const CONCENTRATION_EDIT_IONS = ['Na+', 'K+', 'Cl-', 'HCO3-', 'Ca2+', 'Phosphate', 'Glucose'];
const CONCENTRATION_EDIT_COMPARTMENTS = ['apicalECF', 'basolateralECF'];
const ION_LABEL = {
  'Na+': 'Na⁺',
  'K+': 'K⁺',
  'Cl-': 'Cl⁻',
  'H+': 'H⁺',
  'HCO3-': 'HCO₃⁻',
  'Ca2+': 'Ca²⁺',
  Phosphate: 'Pi',
  'OA-': 'OA⁻',
  'OC+': 'OC⁺',
  AA: 'AA',
  Peptide: 'Peptide',
  Glucose: 'Glucose',
  H2O: 'H₂O'
};
const SURFACE_TRANSPORT_SENSITIVITY = 0.5;
const SURFACE_MIXING_FRACTION = 0.25;
const SURFACE_MAX_MULTIPLIER = 2;
const GENERAL_DISPLAY_EXCLUDED_IONS = ['H+'];
const PASSIVE_SOLUTE_CHANNELS = {
  GLUT2: 'Glucose'
};
const NAPI_TRANSPORTER_IDS = ['NaPi2', 'NaPi'];
const SELECTED_ELECTROCHEMICAL_CHANNELS = {
  ENaC: ['Na+'],
  ROMK: ['K+'],
  CFTR: ['Cl-', 'HCO3-'],
  ClCKb: ['Cl-'],
  TRPV56: ['Ca2+']
};
const SELECTED_COUPLED_ELECTROCHEMICAL_RULES = {
  SGLT: { support: 0.08, oppose: 0.04 },
  NaPi: { support: 0.08, oppose: 0.04 },
  NCX1: { support: 0.08, oppose: 0.04 }
};
const ACTIVE_CELL_CONCENTRATION_GAIN = {
  Glucose: 20
};
const FLUX_GROUPS = [
  { key: 'ions', label: 'Inorganic Ion Fluxes', solutes: ['Na+', 'K+', 'Cl-', 'H+', 'HCO3-', 'Ca2+', 'Phosphate'] },
  { key: 'nutrients', label: 'Nutrient Fluxes', solutes: ['Glucose', 'AA', 'Peptide'] },
  { key: 'organic', label: 'Organic Ion Fluxes', solutes: ['OA-', 'OC+'] }
];
const FLUX_BAR_SERIES = [
  { key: 'apicalStep', name: 'Apical membrane', color: '#2563eb' },
  { key: 'basolateralStep', name: 'Basolateral membrane', color: '#059669' },
  { key: 'paracellularStep', name: 'Paracellular', color: '#d97706' },
  { key: 'transepithelial', name: 'Net epithelial', color: '#fb7185' }
];
const DIRECTIONAL_FLUX_GRAPH_EPSILON = 0.001;
const SNAPSHOT_TEP_INDICATOR_MAX = 0.75;
const SNAPSHOT_ACID_BASE_INDICATOR_MAX = 1;
const SNAPSHOT_WATER_INDICATOR_MAX = 1.5;
const CONCENTRATION_COMPARTMENTS = [
  { key: 'apicalBulk', label: 'Apical Bulk ECF', name: 'Apical Bulk ECF', color: '#2dd4bf' },
  { key: 'apicalSurface', label: 'Apical Surface ECF', name: 'Apical Surface ECF', color: '#0f766e' },
  { key: 'icf', label: 'Cell', name: 'ICF', color: '#8b5cf6', fillOpacity: 0.75 },
  { key: 'basolateralSurface', label: 'Basolateral Surface ECF', name: 'Basolateral Surface ECF', color: '#ea580c' },
  { key: 'basolateralBulk', label: 'Basolateral Bulk ECF', name: 'Basolateral Bulk ECF', color: '#fb923c' }
];
const SETTINGS_CONCENTRATION_COMPARTMENTS = [
  { key: 'apicalECF', label: 'Apical bath', editable: true },
  { key: 'icf', label: 'Cell, modeled', editable: false },
  { key: 'basolateralECF', label: 'Basolateral bath', editable: true }
];
const PASSIVE_CONDUCTANCE_SCALE = {
  GLUT2: 4,
  TRPV56: 0.25
};
const IMPLICIT_VM_DRIVE = {
  'Na+': 0.35,
  'K+': 0.35,
  'Ca2+': 0.75,
  'Cl-': -0.4,
  'HCO3-': -0.35
};
const ANION_LOADING_DRIVE_SCALE = 0.75;
const ANION_LOADING_SENSITIVITY = 0.25;
const ECF_CONCENTRATION_LIMITS = {
  'Na+': { min: 120, max: 160, warnLowMax: 130, warnHighMin: 150 },
  'K+': { min: 2, max: 8, warnLowMax: 3, warnHighMin: 6 },
  'Cl-': { min: 80, max: 130, warnLowMax: 95, warnHighMin: 115 },
  'HCO3-': { min: 10, max: 40, warnLowMax: 18, warnHighMin: 32 },
  'Ca2+': { min: 0.5, max: 2.5, warnLowMax: 0.8, warnHighMin: 1.8 },
  Phosphate: { min: 0.3, max: 3.0, warnLowMax: 0.6, warnHighMin: 2.0 },
  Glucose: { min: 0, max: 20, warnLowMax: 2, warnHighMin: 12 }
};
const ECF_HARD_BLOCK_MESSAGE = 'This value is outside SALT’s allowed range for introductory epithelial transport modeling.';
const ECF_WARNING_MESSAGE = 'This concentration is outside the usual teaching range and may produce nonphysiological flux behavior.';
const SUPPORT_PUMP_ID = 'NaKATPase';
const PUMP_K_LOADING_PER_NA_SUPPORT = 2 / 3;
const PUMP_NA_EXTRUSION_PER_K_SUPPORT = 3 / 2;
const KIR_PUMP_RECYCLING_CAPACITY_SCALE = 1;
const APICAL_K_RECYCLING_TEP_COUPLING = 1;
const CELL_IMBALANCE_EPSILON = 0.1;
const ELECTROCHEMICAL_CONTEXT_EPSILON = 0.05;
const COUPLED_MISMATCH_EPSILON = 0.05;
const COUPLED_COMPLETION_FRACTION = 0.85;
const COUPLED_MISMATCH_EXCLUSIONS = [SUPPORT_PUMP_ID, 'AE1', 'CFTR', 'MATE', 'PepT'];

function cloneConcentrations(source) {
  return {
    apicalECF: { ...source.apicalECF },
    icf: { ...source.icf },
    basolateralECF: { ...source.basolateralECF }
  };
}

function transporterFluxCapacity(transporter) {
  return (transporter.kinetics.maxRate / (transporter.kinetics.Km + 1)) * (Number(transporter.density) || 0);
}

function naKATPaseSupportProfile(tList) {
  const pumps = tList.filter(t => t.id === SUPPORT_PUMP_ID && t.placement !== 'none');
  const template = INITIAL_TRANSPORTERS.find(t => t.id === SUPPORT_PUMP_ID);
  const normalCapacity = template ? transporterFluxCapacity(template) : 1;
  const supportCapacity = pumps.reduce((sum, pump) => sum + transporterFluxCapacity(pump), 0);
  const placements = Array.from(new Set(pumps.map(pump => pump.placement)));
  const pumpDetails = pumps.map(pump => ({
    placement: pump.placement,
    capacity: transporterFluxCapacity(pump)
  }));

  return {
    present: pumps.length > 0,
    pumps: pumpDetails,
    placements,
    gradientStrength: pumps.length > 0 ? 1 : 0,
    naExtrusionCapacity: supportCapacity,
    kLoadingCapacity: supportCapacity,
    normalCapacity
  };
}

function averageEditableReservoirConcentration(baseConcentrations, ion) {
  const apical = Number(baseConcentrations.apicalECF?.[ion]);
  const basolateral = Number(baseConcentrations.basolateralECF?.[ion]);
  if (Number.isFinite(apical) && Number.isFinite(basolateral)) return (apical + basolateral) / 2;
  if (Number.isFinite(apical)) return apical;
  if (Number.isFinite(basolateral)) return basolateral;
  return Number(INITIAL_CONCENTRATIONS.apicalECF[ion] ?? 0);
}

function deriveEffectiveStartingIcf(baseConcentrations, tList) {
  const effectiveIcf = { ...baseConcentrations.icf };
  const supportProfile = naKATPaseSupportProfile(tList);

  ['Na+', 'K+'].forEach(ion => {
    if (supportProfile.present) {
      effectiveIcf[ion] = Number(baseConcentrations.icf?.[ion] ?? INITIAL_CONCENTRATIONS.icf[ion] ?? effectiveIcf[ion]);
    } else {
      effectiveIcf[ion] = averageEditableReservoirConcentration(baseConcentrations, ion);
    }
  });

  return effectiveIcf;
}

function naKATPaseSupportLabel(profile) {
  if (!profile.present) return 'none';
  if (profile.naExtrusionCapacity < profile.normalCapacity - 0.001) return 'low capacity';
  if (profile.naExtrusionCapacity > profile.normalCapacity + 0.001) return 'high capacity';
  return 'normal capacity';
}

function apicalNaEntryCapacity(apicalFlux) {
  return Math.max(apicalFlux['Na+'] || 0, 0);
}

function apicalKExitCapacity(apicalFlux) {
  return Math.max(-(apicalFlux['K+'] || 0), 0);
}

function pumpSupportedNaCompletion(apicalFlux, supportProfile) {
  if (!supportProfile.present) return 0;
  return Math.min(apicalNaEntryCapacity(apicalFlux), supportProfile.naExtrusionCapacity);
}

function pumpSupportedKCompletion(apicalFlux, supportProfile) {
  if (!supportProfile.present) return 0;
  return Math.min(apicalKExitCapacity(apicalFlux), supportProfile.kLoadingCapacity);
}

function pumpKLoadingForNaSupport(supportedNaAbsorption) {
  return supportedNaAbsorption * PUMP_K_LOADING_PER_NA_SUPPORT;
}

function pumpNaExtrusionForKSupport(supportedKSecretion) {
  return supportedKSecretion * PUMP_NA_EXTRUSION_PER_K_SUPPORT;
}

function emptyPumpFluxByMembrane() {
  return {
    apical: { 'Na+': 0, 'K+': 0 },
    basolateral: { 'Na+': 0, 'K+': 0 }
  };
}

function addDistributedPumpFlux(target, pumpDetails, ion, flux) {
  const totalCapacity = pumpDetails.reduce((sum, pump) => sum + Math.max(Number(pump.capacity) || 0, 0), 0);
  if (Math.abs(flux) < DIRECTIONAL_FLUX_GRAPH_EPSILON || totalCapacity < DIRECTIONAL_FLUX_GRAPH_EPSILON) return;
  pumpDetails.forEach(pump => {
    if (!target[pump.placement]) return;
    const share = Math.max(Number(pump.capacity) || 0, 0) / totalCapacity;
    target[pump.placement][ion] = (target[pump.placement][ion] || 0) + flux * share;
  });
}

function buildPumpSupportReport(
  supportProfile,
  supportedNaCompletion,
  pumpNaExtrusionForKCompletion,
  pumpKLoadingForNaCompletion,
  supportedKCompletion,
  mechanismNaExtrusion = null,
  mechanismKLoading = null
) {
  const naExtrusion = Math.max(supportedNaCompletion, pumpNaExtrusionForKCompletion);
  const kLoading = Math.max(pumpKLoadingForNaCompletion, supportedKCompletion);
  const tracedNaExtrusion = mechanismNaExtrusion == null ? naExtrusion : Math.max(Number(mechanismNaExtrusion) || 0, 0);
  const tracedKLoading = mechanismKLoading == null ? kLoading : Math.max(Number(mechanismKLoading) || 0, 0);
  const pumpDetails = supportProfile.pumps || [];
  const includedDisplayFlux = emptyPumpFluxByMembrane();
  const hiddenCellFlux = emptyPumpFluxByMembrane();
  const graphFlux = emptyPumpFluxByMembrane();
  const rows = [];
  addDistributedPumpFlux(includedDisplayFlux, pumpDetails, 'Na+', -supportedNaCompletion);
  addDistributedPumpFlux(includedDisplayFlux, pumpDetails, 'K+', supportedKCompletion);
  addDistributedPumpFlux(hiddenCellFlux, pumpDetails, 'Na+', -Math.max(0, naExtrusion - supportedNaCompletion));
  addDistributedPumpFlux(hiddenCellFlux, pumpDetails, 'K+', Math.max(0, kLoading - supportedKCompletion));
  addDistributedPumpFlux(graphFlux, pumpDetails, 'Na+', -tracedNaExtrusion);
  addDistributedPumpFlux(graphFlux, pumpDetails, 'K+', tracedKLoading);

  if (naExtrusion >= DIRECTIONAL_FLUX_GRAPH_EPSILON) {
    const roleParts = [];
    if (supportedNaCompletion >= DIRECTIONAL_FLUX_GRAPH_EPSILON) {
      roleParts.push('balances Na⁺ entry and completes Na⁺ absorption');
    }
    if (pumpNaExtrusionForKCompletion > supportedNaCompletion + DIRECTIONAL_FLUX_GRAPH_EPSILON) {
      roleParts.push('maintains pump cycling for K⁺ loading');
    }
    rows.push({
      process: 'Na⁺ extrusion',
      ion: 'Na+',
      direction: 'out of cell',
      pumpActivity: naExtrusion,
      epithelialContribution: supportedNaCompletion,
      cellOnlyContribution: Math.max(0, naExtrusion - supportedNaCompletion),
      cellEffect: -naExtrusion,
      magnitude: naExtrusion,
      role: roleParts.join('; ') || 'maintains low intracellular Na⁺'
    });
  }

  if (kLoading >= DIRECTIONAL_FLUX_GRAPH_EPSILON) {
    const roleParts = [];
    if (pumpKLoadingForNaCompletion >= DIRECTIONAL_FLUX_GRAPH_EPSILON) {
      roleParts.push('stoichiometric K⁺ loading linked to Na⁺ extrusion');
    }
    if (supportedKCompletion >= DIRECTIONAL_FLUX_GRAPH_EPSILON) {
      roleParts.push('supports K⁺ exit or secretion');
    }
    rows.push({
      process: 'K⁺ loading',
      ion: 'K+',
      direction: 'into cell',
      pumpActivity: kLoading,
      epithelialContribution: supportedKCompletion,
      cellOnlyContribution: Math.max(0, kLoading - supportedKCompletion),
      cellEffect: kLoading,
      magnitude: kLoading,
      role: roleParts.join('; ') || 'maintains high intracellular K⁺'
    });
  }

  return {
    present: supportProfile.present,
    active: rows.length > 0,
    placements: supportProfile.placements || [],
    includedDisplayFlux,
    hiddenCellFlux,
    graphFlux,
    supportedNaCompletion,
    supportedKCompletion,
    pumpNaExtrusionForKCompletion,
    pumpKLoadingForNaCompletion,
    naExtrusion,
    kLoading,
    tracedNaExtrusion,
    tracedKLoading,
    rows
  };
}

function surfaceClamp(value, bulkValue) {
  const upper = Math.max((bulkValue || 1) * SURFACE_MAX_MULTIPLIER, 1);
  return Math.min(Math.max(value, 0), upper);
}

function clampToUnit(value) {
  return Math.max(-1, Math.min(1, Number(value) || 0));
}

function normalizedConcentrationTendency(outsideConcentration, cellConcentration) {
  const outside = Math.max(Number(outsideConcentration) || 0, 0);
  const cell = Math.max(Number(cellConcentration) || 0, 0);
  const denominator = outside + cell + 1;
  return clampToUnit((outside - cell) / denominator);
}

function implicitVmDriveForIon(ion, hasNormalImplicitVm, chemicalSignal, activeLoadingFlux = 0) {
  if (!hasNormalImplicitVm) return 0;
  const baseDrive = IMPLICIT_VM_DRIVE[ion] || 0;
  const valence = ION_VALENCE[ion] || 0;
  if (valence >= 0) return baseDrive;
  const loadingSignal = Math.tanh(Math.max(Number(activeLoadingFlux) || 0, 0) / ANION_LOADING_SENSITIVITY);
  const availabilityFactor = chemicalSignal < 0
    ? 1
    : Math.min(1, 0.3 + loadingSignal * 0.7);
  return baseDrive * availabilityFactor;
}

function anionLoadingDrive(ion, activeLoadingFlux = 0) {
  if ((ION_VALENCE[ion] || 0) >= 0) return 0;
  const loadingSignal = Math.tanh(Math.max(Number(activeLoadingFlux) || 0, 0) / ANION_LOADING_SENSITIVITY);
  return -ANION_LOADING_DRIVE_SCALE * loadingSignal;
}

function netStoichiometricCharge(stoich) {
  return Object.entries(stoich)
    .filter(([ion]) => ion !== 'H2O')
    .reduce((sum, [ion, coeff]) => sum + (ION_VALENCE[ion] || 0) * coeff, 0);
}

function qualitativeCoupledVmRateFactor(transporter, effectiveStoich, hasNormalImplicitVm) {
  const rule = SELECTED_COUPLED_ELECTROCHEMICAL_RULES[transporter.id];
  if (!rule || !hasNormalImplicitVm) return 1;
  const netCharge = netStoichiometricCharge(effectiveStoich);
  if (netCharge > 0) return 1 + rule.support;
  if (netCharge < 0) return Math.max(0.85, 1 - rule.oppose);
  return 1;
}

function hasOppositePlacedTransporter(tList, id, placement) {
  return tList.some(t => t.id === id && t.placement !== 'none' && t.placement !== placement);
}

function hasElevatedModeledCalcium(baseline) {
  const modeled = Number(baseline?.icf?.['Ca2+'] ?? 0);
  const initial = Number(INITIAL_CONCENTRATIONS.icf['Ca2+'] ?? 0);
  return modeled > initial + 0.001;
}

function coupledTransporterRateFactor(transporter, effectiveStoich, hasNormalImplicitVm, tList, baseline) {
  if (transporter.id === 'NCX1') {
    const hasCalciumLoadingContext =
      hasOppositePlacedTransporter(tList, 'TRPV56', transporter.placement) ||
      hasElevatedModeledCalcium(baseline);
    if (!hasCalciumLoadingContext) return 0;
  }
  return qualitativeCoupledVmRateFactor(transporter, effectiveStoich, hasNormalImplicitVm);
}

function surfacePHDirection(flux) {
  const surfaceHChange = -flux;
  if (Math.abs(surfaceHChange) < 0.001) return 'no strong local pH tendency';
  return surfaceHChange > 0 ? 'surface pH tends lower' : 'surface pH tends higher';
}

function cellPHDirection(hFlux, hco3Flux = 0) {
  const acidLoad = hFlux - hco3Flux;
  if (Math.abs(acidLoad) < 0.001) return 'no strong cell pH tendency';
  return acidLoad > 0 ? 'cell tends acidified' : 'cell tends alkalinized';
}

function epithelialAcidBaseDirection(value) {
  if (Math.abs(value) < 0.001) return 'no strong net acid/base tendency';
  return value > 0 ? 'acid secretion / base absorption' : 'base secretion / acid absorption';
}

function buildSurfaceConcentrations(apicalBulk, basolateralBulk, apicalFlux, basolateralFlux) {
  const transportScale = SURFACE_TRANSPORT_SENSITIVITY * (1 - SURFACE_MIXING_FRACTION);
  const apicalSurface = { ...apicalBulk };
  const basolateralSurface = { ...basolateralBulk };

  Object.keys(apicalBulk).forEach(ion => {
    if (ion === 'H2O') return;
    if (ion === 'H+') {
      apicalSurface[ion] = apicalBulk[ion];
      basolateralSurface[ion] = basolateralBulk[ion];
      return;
    }
    apicalSurface[ion] = surfaceClamp(apicalBulk[ion] - (apicalFlux[ion] || 0) * transportScale, apicalBulk[ion]);
    basolateralSurface[ion] = surfaceClamp(basolateralBulk[ion] - (basolateralFlux[ion] || 0) * transportScale, basolateralBulk[ion]);
  });

  return {
    apicalSurface,
    basolateralSurface,
    pHTendency: {
      apical: surfacePHDirection(apicalFlux['H+'] || 0),
      basolateral: surfacePHDirection(basolateralFlux['H+'] || 0)
    }
  };
}

function activeCellConcentrationDelta(ion, flux) {
  const gain = flux > 0 ? (ACTIVE_CELL_CONCENTRATION_GAIN[ion] || 1) : 1;
  return flux * gain;
}

function restoreTowardBaseline(modeledIcf, baselineIcf, ion, supportCapacity) {
  const depletion = Math.max(0, Number(baselineIcf[ion] || 0) - Number(modeledIcf[ion] || 0));
  const correction = Math.min(depletion, Math.max(Number(supportCapacity) || 0, 0));
  modeledIcf[ion] = Number(modeledIcf[ion] || 0) + correction;
  return correction;
}

function concentrationGradientFlux(transporter, outsideConcentration, cellConcentration) {
  const conductanceScale = PASSIVE_CONDUCTANCE_SCALE[transporter.id] || 1;
  const maxFlux = (transporter.kinetics.maxRate / (transporter.kinetics.Km + 1)) * transporter.density * conductanceScale;
  const effectiveCellConcentration = Math.max(cellConcentration, 0);
  const denominator = Math.abs(outsideConcentration) + Math.abs(effectiveCellConcentration) + 1;
  const gradientSignal = (outsideConcentration - effectiveCellConcentration) / denominator;
  return maxFlux * gradientSignal;
}

function electrochemicalChannelSignals(ion, outsideConcentration, cellConcentration, hasNormalImplicitVm, activeLoadingFlux = 0) {
  const chemicalSignal = normalizedConcentrationTendency(outsideConcentration, cellConcentration);
  const electricalApplied = Boolean(hasNormalImplicitVm && (ION_VALENCE[ion] || 0) !== 0);
  const electricalSignal = implicitVmDriveForIon(ion, hasNormalImplicitVm, chemicalSignal, activeLoadingFlux);
  const loadingSignal = anionLoadingDrive(ion, activeLoadingFlux);
  return {
    chemicalSignal,
    electricalSignal,
    loadingSignal,
    netSignal: clampToUnit(chemicalSignal + electricalSignal + loadingSignal),
    electricalApplied
  };
}

function electrochemicalChannelMaxFlux(transporter, ion) {
  const conductanceScale = PASSIVE_CONDUCTANCE_SCALE[transporter.id] || 1;
  const stoichScale = Math.abs(transporter.stoich[ion] ?? 1);
  return (transporter.kinetics.maxRate / (transporter.kinetics.Km + 1)) * transporter.density * conductanceScale * stoichScale;
}

function concentrationValidationMessage(ion, value) {
  const limits = ECF_CONCENTRATION_LIMITS[ion];
  if (!limits) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return { level: 'error', message: ECF_HARD_BLOCK_MESSAGE };
  if (numeric < limits.min || numeric > limits.max) {
    return { level: 'error', message: ECF_HARD_BLOCK_MESSAGE };
  }
  if (
    (numeric >= limits.min && numeric <= limits.warnLowMax) ||
    (numeric >= limits.warnHighMin && numeric <= limits.max)
  ) {
    return { level: 'warning', message: ECF_WARNING_MESSAGE };
  }
  return null;
}

function clampEditableConcentration(ion, value) {
  const limits = ECF_CONCENTRATION_LIMITS[ion];
  const numeric = Math.max(Number(value) || 0, 0);
  if (!limits) return numeric;
  return Math.min(Math.max(numeric, limits.min), limits.max);
}

function coupledSolutes(stoich) {
  return Object.entries(stoich)
    .filter(([ion, coeff]) => ion !== 'H2O' && coeff !== 0);
}

function transepithelialDirectionForMembraneFlux(placement, coeff) {
  return (placement === 'apical' ? 1 : -1) * Math.sign(coeff);
}

function buildCoupledMismatchReport(coupledEvents, transepiFluxDataNoH2O) {
  if (!coupledEvents.length) {
    return {
      state: 'none',
      label: 'Coupled transport: none',
      ariaLabel: 'No active coupled transporters in this layout.',
      details: []
    };
  }

  const transepithelialByIon = Object.fromEntries(
    transepiFluxDataNoH2O.map(row => [row.ion, row.transepithelial || 0])
  );
  const details = coupledEvents.map(event => {
    const solutes = coupledSolutes(event.stoich).map(([ion, coeff]) => {
      const required = Math.abs(event.rate * coeff);
      const expectedDirection = transepithelialDirectionForMembraneFlux(event.placement, coeff);
      const completed = Math.max(0, expectedDirection * (transepithelialByIon[ion] || 0));
      const completion = required < COUPLED_MISMATCH_EPSILON ? 1 : completed / required;
      return {
        ion,
        required,
        completed,
        completion,
        limited: required >= COUPLED_MISMATCH_EPSILON &&
          completed + COUPLED_MISMATCH_EPSILON < required * COUPLED_COMPLETION_FRACTION
      };
    });
    const limitedSolutes = solutes.filter(solute => solute.limited);
    return {
      transporter: event.name,
      placement: event.placement,
      solutes,
      limitedSolutes: limitedSolutes.map(solute => solute.ion)
    };
  }).filter(event => event.limitedSolutes.length > 0);

  return details.length
    ? {
        state: 'mismatch',
        label: 'Coupled transport: mismatch',
        ariaLabel: 'Coupled transport mismatch detected in ' + details.map(detail => detail.transporter).join(', ') + '.',
        details
      }
    : {
        state: 'matched',
        label: 'Coupled transport: matched',
        ariaLabel: 'Active coupled transporters have matching transepithelial completion in this teaching model.',
        details: []
      };
}

function imbalanceDirection(value) {
  if (Math.abs(value) < CELL_IMBALANCE_EPSILON) return 'near steady';
  return value > 0 ? 'accumulation tendency' : 'depletion tendency';
}

function buildCellImbalanceReport(baselineIcf, modeledIcf) {
  return Object.keys(baselineIcf)
    .filter(ion => ion !== 'H2O' && !GENERAL_DISPLAY_EXCLUDED_IONS.includes(ion))
    .map(ion => {
      const change = (modeledIcf[ion] || 0) - (baselineIcf[ion] || 0);
      return {
        ion,
        label: ION_LABEL[ion] || ion,
        change,
        direction: imbalanceDirection(change)
      };
    })
    .filter(row => Math.abs(row.change) >= CELL_IMBALANCE_EPSILON);
}

function buildMatchedDisplayFluxes(baseDisplayApicalFlux, baseDisplayBasolateralFlux, transepiFluxDataNoH2O, paraFlux = {}) {
  const displayApicalFlux = { ...baseDisplayApicalFlux };
  const displayBasolateralFlux = { ...baseDisplayBasolateralFlux };

  transepiFluxDataNoH2O.forEach(row => {
    const ion = row.ion;
    if (ion === 'H2O') return;
    const transcellularFlux = Number(row.transepithelial || 0) - Number(paraFlux[ion] || 0);
    if (Math.abs(transcellularFlux) < DIRECTIONAL_FLUX_GRAPH_EPSILON) return;

    displayApicalFlux[ion] = transcellularFlux;
    displayBasolateralFlux[ion] = -transcellularFlux;
  });

  return { displayApicalFlux, displayBasolateralFlux };
}

function niceConcentrationAxisMax(value) {
  const raw = Math.max(Number(value || 0) * 1.15, 0.01);
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const scaled = raw / magnitude;
  const steps = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10];
  const step = steps.find(candidate => scaled <= candidate) || 10;
  return step * magnitude;
}

function formatConcentrationAxisTick(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  const magnitude = Math.abs(numeric);
  if (magnitude >= 100) return String(Math.round(numeric));
  if (magnitude >= 10) return String(Number(numeric.toFixed(1)));
  if (magnitude >= 1) return String(Number(numeric.toFixed(2)));
  return String(Number(numeric.toFixed(4)));
}

function concentrationZoomTickLines(value) {
  const label = String(value || '');
  const match = label.match(/^(Apical|Basolateral)\s+(.+)$/);
  return match ? [match[1], match[2]] : [label];
}

function ConcentrationZoomAxisTick({ x = 0, y = 0, payload }) {
  const lines = concentrationZoomTickLines(payload?.value);
  const firstLineDy = lines.length > 1 ? 8 : 14;

  return (
    <g transform={'translate(' + x + ',' + y + ')'}>
      <text textAnchor="middle" fill="#374151" fontSize={11}>
        {lines.map((line, index) => (
          <tspan key={line + index} x={0} dy={index === 0 ? firstLineDy : 13}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

export default function App() {
  // State
  const [showAbout, setShowAbout] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [modalTransporterId, setModalTransporterId] = useState(null);
  const [transporters, setTransporters] = useState([]);
  const [result, setResult] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [appMode, setAppMode] = useState('explore');
  const [resultsView, setResultsView] = useState('mechanism');
  const [zoomedConcentrationIon, setZoomedConcentrationIon] = useState(null);
  const [baseConcentrations, setBaseConcentrations] = useState(() => cloneConcentrations(INITIAL_CONCENTRATIONS));
  const [concentrationValidation, setConcentrationValidation] = useState({});
  const [tissuePreset, setTissuePreset] = useState('all');
  const [backgroundOsmoticPullSetting, setBackgroundOsmoticPullSetting] = useState('tissue');

  // Paracellular pathway state
  const [paracellularType, setParacellularType] = useState('none'); // 'none' | 'cation' | 'anion'
  const [paraCationPerm, setParaCationPerm] = useState(1.0); // default value
  const [paraAnionPerm, setParaAnionPerm] = useState(1.0);   // default value
  const [showParaInfo, setShowParaInfo] = useState(false);
  const [activeTransporterTooltip, setActiveTransporterTooltip] = useState(null);
  const tooltipHideTimerRef = useRef(null);
  const instructorDemoMode = ENABLE_INSTRUCTOR_DEMO_MODE && appMode === 'demo';

  // --- Automatically run simulation on page load ---
  useEffect(() => {
  calculateFluxesAndConcs(transporters);
  // eslint-disable-next-line
}, [
  transporters,
  paracellularType,
  paraCationPerm,
  paraAnionPerm,
  baseConcentrations,
  tissuePreset,
  backgroundOsmoticPullSetting
]);


  useEffect(() => {
    setTransporters(ts =>
      ts.some(t => !t.uid)
        ? ts.map(t => t.uid ? t : { ...t, uid: t.id + '-' + t.placement + '-' + Math.random().toString(36).slice(2) })
        : ts
    );
  }, []);

  useEffect(() => {
    const handleTooltipEscape = event => {
      if (event.key === 'Escape') setActiveTransporterTooltip(null);
    };
    document.addEventListener('keydown', handleTooltipEscape);
    return () => {
      document.removeEventListener('keydown', handleTooltipEscape);
      if (tooltipHideTimerRef.current) clearTimeout(tooltipHideTimerRef.current);
    };
  }, []);

  const updateTransporter = (uid, field, value) => {
    setTransporters(ts =>
      ts.map(t =>
        t.uid === uid
          ? (field === 'kinetics'
              ? { ...t, kinetics: { ...value } }
              : { ...t, [field]: value })
          : t
      )
    );
  };

  const addTransporterToMembrane = (id, placement) => {
    const transporter = createTransporterInstance(id, placement);
    if (!transporter) return;
    setTransporters(ts => [...ts, transporter]);
  };

  const removeTransporter = uid => {
    setTransporters(ts => ts.filter(t => t.uid !== uid));
  };

  const updateBaseConcentration = (compartment, ion, value) => {
    if (!CONCENTRATION_EDIT_COMPARTMENTS.includes(compartment)) return;
    const requestedNumeric = Math.max(Number(value) || 0, 0);
    const numeric = clampEditableConcentration(ion, value);
    const validation = concentrationValidationMessage(ion, requestedNumeric) || concentrationValidationMessage(ion, numeric);
    const validationKey = compartment + '-' + ion;
    setConcentrationValidation(current => {
      const next = { ...current };
      if (validation) next[validationKey] = validation;
      else delete next[validationKey];
      return next;
    });
    setBaseConcentrations(current => ({
      ...current,
      [compartment]: {
        ...current[compartment],
        [ion]: numeric
      }
    }));
  };

  const resetBaseConcentrations = () => {
    setBaseConcentrations(cloneConcentrations(INITIAL_CONCENTRATIONS));
    setConcentrationValidation({});
  };

  const applyTissueDemoPreset = tissueValue => {
    const preset = TISSUE_DEMO_PRESETS[tissueValue] || TISSUE_DEMO_PRESETS.all;
    setTransporters(demoTransportersForTissue(tissueValue));
    setParacellularType(preset.paracellularType || 'none');
    setParaCationPerm(1.0);
    setParaAnionPerm(1.0);
    setBackgroundOsmoticPullSetting('tissue');
  };

  const handleAppModeChange = event => {
    const nextMode = event.target.value;
    setAppMode(nextMode);
    if (nextMode === 'demo') {
      const demoTissuePreset = HIDDEN_TISSUE_OPTION_VALUES.has(tissuePreset) ? 'all' : tissuePreset;
      if (demoTissuePreset !== tissuePreset) setTissuePreset(demoTissuePreset);
      applyTissueDemoPreset(demoTissuePreset);
    }
  };

  const handleTissuePresetChange = event => {
    const requestedTissuePreset = event.target.value;
    const nextTissuePreset = HIDDEN_TISSUE_OPTION_VALUES.has(requestedTissuePreset) ? 'all' : requestedTissuePreset;
    setTissuePreset(nextTissuePreset);
    if (instructorDemoMode) {
      applyTissueDemoPreset(nextTissuePreset);
    }
  };

  const resetAllSettings = () => {
    setTransporters([]);
    setParacellularType('none');
    setParaCationPerm(1.0);
    setParaAnionPerm(1.0);
    setBaseConcentrations(cloneConcentrations(INITIAL_CONCENTRATIONS));
    setConcentrationValidation({});
    setTissuePreset('all');
    setBackgroundOsmoticPullSetting('tissue');
    setResultsView('mechanism');
    setZoomedConcentrationIon(null);
    setShowInfoModal(false);
    setModalTransporterId(null);
    setShowParaInfo(false);
    setActiveTransporterTooltip(null);
    setShowResetConfirm(false);
    setAppMode('explore');
  };

  // --- Simulation Logic ---

// Helper to get placements for a transporter in this simulation step
function placementsForTick(id, tList) {
  const canonicalId = canonicalTransporterId(id);
  return tList
    .filter(t => canonicalTransporterId(t.id) === canonicalId && t.placement !== 'none')
    .map(t => t.placement);
}

// Refactored transepithelialFlux
function transepithelialFlux(ion, entryIds, exitIds, requirePump, apicalFlux, basolateralFlux, tList, hasNaKATPase) {
  if (requirePump && !hasNaKATPase) return 0;
  const entrySides = [].concat(...entryIds.map(id => placementsForTick(id, tList)));
  const exitSides = [].concat(...exitIds.map(id => placementsForTick(id, tList)));
  for (let side1 of entrySides) {
    for (let side2 of exitSides) {
      if (side1 !== side2) {
        const entryFlux = side1 === 'apical' ? (apicalFlux[ion] ?? 0) : (basolateralFlux[ion] ?? 0);
        const exitFlux  = side2 === 'apical' ? (apicalFlux[ion] ?? 0) : (basolateralFlux[ion] ?? 0);
        if (entryFlux > 0 && exitFlux < 0) {
          return (side1 === 'apical' ? 1 : -1) * Math.min(Math.abs(entryFlux), Math.abs(exitFlux));
        } else if (entryFlux < 0 && exitFlux > 0) {
          return (side2 === 'apical' ? 1 : -1) * Math.min(Math.abs(entryFlux), Math.abs(exitFlux));
        }
      }
    }
  }
  return 0;
}

function limitFluxMagnitude(flux, maxMagnitude) {
  const magnitude = Math.max(Number(maxMagnitude) || 0, 0);
  if (magnitude <= 0) return 0;
  return Math.sign(flux) * Math.min(Math.abs(flux), magnitude);
}

function naPiNaPerPhosphateForFlux(coupledEvents, phosphateFlux) {
  const direction = Math.sign(phosphateFlux);
  if (direction === 0) return 0;

  const candidates = coupledEvents.filter(event =>
    NAPI_TRANSPORTER_IDS.includes(event.id) &&
    Math.sign(transepithelialDirectionForMembraneFlux(event.placement, event.stoich.Phosphate || 0)) === direction
  );
  const totalPhosphateCapacity = candidates.reduce(
    (sum, event) => sum + Math.abs((event.rate || 0) * (event.stoich.Phosphate || 0)),
    0
  );
  if (totalPhosphateCapacity < DIRECTIONAL_FLUX_GRAPH_EPSILON) return 0;

  return candidates.reduce((sum, event) => {
    const phosphateCapacity = Math.abs((event.rate || 0) * (event.stoich.Phosphate || 0));
    return sum + phosphateCapacity * Math.abs(event.stoich['Na+'] || 0);
  }, 0) / totalPhosphateCapacity;
}

function naPiPhosphateFluxWithNaSupport(rawPhosphateFlux, coupledEvents, supportedNaAbsorption) {
  const naPerPhosphate = naPiNaPerPhosphateForFlux(coupledEvents, rawPhosphateFlux);
  if (!naPerPhosphate) return rawPhosphateFlux;
  return limitFluxMagnitude(rawPhosphateFlux, Math.abs(supportedNaAbsorption || 0) / naPerPhosphate);
}

function activeStoichForPlacement(transporter) {
  return transporter.stoich;
}

const calculateFluxesAndConcs = (tList = transporters) => {
  // Bulk baths are fixed teaching reservoirs; local surface layers are computed below.
  const effectiveStartingIcf = deriveEffectiveStartingIcf(baseConcentrations, tList);
  const baseline = {
    ...baseConcentrations,
    icf: effectiveStartingIcf
  };
  const apicalECF = { ...baseline.apicalECF };
  const basolateralECF = { ...baseline.basolateralECF };
  const apicalFlux = {};
  const basolateralFlux = {};
  const fluxSolutes = Array.from(new Set([
    ...Object.keys(baseline.apicalECF),
    ...FLUX_ONLY_SOLUTES,
    ...tList.flatMap(t => Object.keys(t.stoich))
  ]));
  fluxSolutes.forEach(ion => { apicalFlux[ion] = 0; basolateralFlux[ion] = 0; });

  const pumpSupportProfile = naKATPaseSupportProfile(tList);
  const hasNaKATPase = pumpSupportProfile.present;
  const passiveChannels = [];
  const coupledEvents = [];
  const electrochemicalContextEvents = [];
  const fluxEvents = [];
  const kirPassiveEvents = [];

  // Calculate active/coupled transport first, then passive channels respond to gradients.
  tList.forEach(t => {
    if (t.placement === 'none') return;
    const effectiveStoich = activeStoichForPlacement(t);
    if (Object.keys(effectiveStoich).includes('H2O')) return;
    if (PASSIVE_SOLUTE_CHANNELS[t.id] || SELECTED_ELECTROCHEMICAL_CHANNELS[t.id]) {
      passiveChannels.push(t);
      return;
    }
    if (t.id === SUPPORT_PUMP_ID) return;
    if (t.id === 'OAT' && !hasNaKATPase) return;
    if (effectiveStoich['Na+'] && !hasNaKATPase) return;

    let rate = transporterFluxCapacity(t) *
      coupledTransporterRateFactor(t, effectiveStoich, hasNaKATPase, tList, baseline);
    if (Math.abs(rate) < 0.001) return;
    if (t.id === 'NHE3') {
      const h = (baseline.icf['H+']);
      const pH = -Math.log10(h);
      const pH50 = 7.2;
      const sigma = 0.05;
      rate *= 1 / (1 + Math.exp((pH - pH50) / sigma));
    }
    if (!COUPLED_MISMATCH_EXCLUSIONS.includes(t.id) && coupledSolutes(effectiveStoich).length > 1) {
      coupledEvents.push({
        id: t.id,
        name: t.name,
        placement: t.placement,
        rate,
        stoich: { ...effectiveStoich }
      });
    }
    fluxEvents.push({
      id: t.id,
      name: t.name,
      placement: t.placement,
      type: coupledSolutes(effectiveStoich).length > 1 ? 'coupled' : 'active',
      solutes: Object.entries(effectiveStoich)
        .filter(([ion]) => ion !== 'H2O')
        .map(([ion, coeff]) => ({
          ion,
          coeff,
          flux: rate * coeff
        }))
    });
    Object.entries(effectiveStoich).forEach(([ion, coeff]) => {
      const delta = rate * coeff;
      if (t.placement === 'apical') apicalFlux[ion] += delta;
      else basolateralFlux[ion] += delta;
    });
  });

  const activeMembraneFlux = {};
  Object.keys(apicalFlux).forEach(ion => {
    activeMembraneFlux[ion] = apicalFlux[ion] + basolateralFlux[ion];
  });

  const activeApicalFlux = { ...apicalFlux };
  const activeNaSupportPreview = pumpSupportedNaCompletion(apicalFlux, pumpSupportProfile);
  const activeNetFlux = {};
  Object.keys(apicalFlux).forEach(ion => {
    activeNetFlux[ion] = activeMembraneFlux[ion] || 0;
  });
  activeNetFlux['Na+'] = (activeNetFlux['Na+'] || 0) - activeNaSupportPreview;
  const prePassiveICF = { ...baseline.icf };
  Object.entries(activeNetFlux)
    .filter(([ion]) => !FLUX_ONLY_SOLUTES.includes(ion))
    .forEach(([ion, flux]) => { prePassiveICF[ion] += activeCellConcentrationDelta(ion, flux); });
  prePassiveICF['H+'] = Math.max(prePassiveICF['H+'], 1e-8);

  const passiveNetFlux = {};
  Object.keys(apicalFlux).forEach(ion => { passiveNetFlux[ion] = 0; });
  passiveChannels.forEach(t => {
    const channelIons = SELECTED_ELECTROCHEMICAL_CHANNELS[t.id] || [PASSIVE_SOLUTE_CHANNELS[t.id]];
    const soluteEvents = channelIons.map(ion => {
      const outsideConcentration = t.placement === 'apical' ? apicalECF[ion] : basolateralECF[ion];
      const signals = SELECTED_ELECTROCHEMICAL_CHANNELS[t.id]
        ? electrochemicalChannelSignals(ion, outsideConcentration, prePassiveICF[ion], hasNaKATPase, activeMembraneFlux[ion] || 0)
        : null;
      const maxChannelFlux = signals ? electrochemicalChannelMaxFlux(t, ion) : null;
      const delta = signals
        ? maxChannelFlux * signals.netSignal
        : concentrationGradientFlux(t, outsideConcentration, prePassiveICF[ion]);
      if (t.placement === 'apical') apicalFlux[ion] += delta;
      else basolateralFlux[ion] += delta;
      passiveNetFlux[ion] += delta;
      if (t.id === 'ROMK' && ion === 'K+') {
        kirPassiveEvents.push({
          placement: t.placement,
          flux: delta,
          capacity: maxChannelFlux || 0
        });
      }
      if (signals) {
        electrochemicalContextEvents.push({
          id: t.id,
          name: t.name,
          placement: t.placement,
          ion,
          chemicalSignal: signals.chemicalSignal,
          electricalSignal: signals.electricalSignal,
          loadingSignal: signals.loadingSignal,
          netSignal: signals.netSignal,
          electricalApplied: signals.electricalApplied,
          capacity: maxChannelFlux || 0,
          flux: delta
        });
      }
      return { ion, coeff: Math.sign(delta), flux: delta };
    });
    fluxEvents.push({
      id: t.id,
      name: t.name,
      placement: t.placement,
      type: 'passive',
      solutes: soluteEvents
    });
  });

  const apicalCftrClEntry = electrochemicalContextEvents
    .filter(event => event.id === 'CFTR' && event.placement === 'apical' && event.ion === 'Cl-' && event.flux > DIRECTIONAL_FLUX_GRAPH_EPSILON)
    .reduce((sum, event) => sum + event.flux, 0);
  const basolateralClcClEvents = electrochemicalContextEvents
    .filter(event => event.id === 'ClCKb' && event.placement === 'basolateral' && event.ion === 'Cl-');
  const basolateralClcCapacity = basolateralClcClEvents
    .reduce((sum, event) => sum + Math.max(Number(event.capacity) || 0, 0), 0);
  const basolateralClcInwardFlux = basolateralClcClEvents
    .reduce((sum, event) => sum + Math.max(Number(event.flux) || 0, 0), 0);
  const apicalEnacPlaced = placementsForTick('ENaC', tList).includes('apical');
  const electrogenicNaAbsorptionPreview = pumpSupportedNaCompletion(apicalFlux, pumpSupportProfile);
  const clAbsorptionCompletion = apicalEnacPlaced && electrogenicNaAbsorptionPreview > DIRECTIONAL_FLUX_GRAPH_EPSILON
    ? Math.min(apicalCftrClEntry, basolateralClcCapacity, electrogenicNaAbsorptionPreview)
    : 0;
  if (clAbsorptionCompletion > DIRECTIONAL_FLUX_GRAPH_EPSILON) {
    const basolateralAdjustment = basolateralClcInwardFlux + clAbsorptionCompletion;
    basolateralFlux['Cl-'] = (basolateralFlux['Cl-'] || 0) - basolateralAdjustment;
    passiveNetFlux['Cl-'] = (passiveNetFlux['Cl-'] || 0) - basolateralAdjustment;
    const totalAdjustableCapacity = basolateralClcClEvents
      .reduce((sum, event) => sum + Math.max(Number(event.capacity) || 0, 0), 0);
    fluxEvents
      .filter(event => event.id === 'ClCKb' && event.placement === 'basolateral')
      .forEach(event => {
        const clSolute = event.solutes.find(solute => solute.ion === 'Cl-');
        if (!clSolute) return;
        const contextEvent = basolateralClcClEvents.find(item => item.name === event.name && item.placement === event.placement);
        const share = totalAdjustableCapacity > DIRECTIONAL_FLUX_GRAPH_EPSILON
          ? Math.max(Number(contextEvent?.capacity) || 0, 0) / totalAdjustableCapacity
          : 1;
        clSolute.flux -= basolateralAdjustment * share;
      });
    basolateralClcClEvents.forEach(event => {
      const share = basolateralClcCapacity > DIRECTIONAL_FLUX_GRAPH_EPSILON
        ? Math.max(Number(event.capacity) || 0, 0) / basolateralClcCapacity
        : 1;
      event.flux -= basolateralAdjustment * share;
    });
  }

  // Na+/K+-ATPase support is traced so students can see which displayed fluxes depend on pump activity.
  const supportedNaAbsorption = pumpSupportedNaCompletion(apicalFlux, pumpSupportProfile);
  const pumpKLoadingForNaAbsorption = pumpKLoadingForNaSupport(supportedNaAbsorption);
  if (pumpKLoadingForNaAbsorption > 0) {
    const basolateralKirExitEvents = kirPassiveEvents.filter(event =>
      event.placement === 'basolateral' &&
      event.flux < -DIRECTIONAL_FLUX_GRAPH_EPSILON
    );
    const basolateralKirExit = basolateralKirExitEvents.reduce(
      (sum, event) => sum + Math.max(-event.flux, 0),
      0
    );
    const basolateralKirCapacity = basolateralKirExitEvents.reduce(
      (sum, event) => sum + Math.max(event.capacity, 0) * KIR_PUMP_RECYCLING_CAPACITY_SCALE,
      0
    );
    const targetKirRecycling = Math.min(pumpKLoadingForNaAbsorption, basolateralKirCapacity);
    const additionalKirRecycling = Math.max(0, targetKirRecycling - basolateralKirExit);
    if (additionalKirRecycling > 0) {
      basolateralFlux['K+'] = (basolateralFlux['K+'] || 0) - additionalKirRecycling;
      passiveNetFlux['K+'] = (passiveNetFlux['K+'] || 0) - additionalKirRecycling;
    }
  }
  const supportedKSecretion = pumpSupportedKCompletion(apicalFlux, pumpSupportProfile);
  const pathwayNaEntryForPumpTrace =
    Math.max(Number(apicalFlux['Na+'] || 0), 0) +
    Math.max(Number(basolateralFlux['Na+'] || 0), 0);
  const pathwayKExitForPumpTrace =
    Math.max(-Number(apicalFlux['K+'] || 0), 0) +
    Math.max(-Number(basolateralFlux['K+'] || 0), 0);
  const tracedNaEntrySupport = pumpSupportProfile.present
    ? Math.min(pathwayNaEntryForPumpTrace, pumpSupportProfile.naExtrusionCapacity)
    : 0;
  const tracedKExitSupport = pumpSupportProfile.present
    ? Math.min(pathwayKExitForPumpTrace, pumpSupportProfile.kLoadingCapacity)
    : 0;
  const tracedPumpNaExtrusion = Math.max(tracedNaEntrySupport, pumpNaExtrusionForKSupport(tracedKExitSupport));
  const tracedPumpKLoading = Math.max(pumpKLoadingForNaSupport(tracedNaEntrySupport), tracedKExitSupport);
  const pumpNaExtrusionForKSecretion = pumpNaExtrusionForKSupport(supportedKSecretion);
  const pumpNaExtrusion = Math.max(supportedNaAbsorption, pumpNaExtrusionForKSecretion);
  const pumpKLoading = Math.max(pumpKLoadingForNaAbsorption, supportedKSecretion);
  const pumpSupportReport = buildPumpSupportReport(
    pumpSupportProfile,
    supportedNaAbsorption,
    pumpNaExtrusionForKSecretion,
    pumpKLoadingForNaAbsorption,
    supportedKSecretion,
    tracedPumpNaExtrusion,
    tracedPumpKLoading
  );
  const hiddenPumpCellFlux = {
    'Na+': -pumpNaExtrusion,
    'K+': pumpKLoading
  };

  const completionApicalFlux = { ...apicalFlux };
  const completionBasolateralFlux = { ...basolateralFlux };
  completionBasolateralFlux['Na+'] = (completionBasolateralFlux['Na+'] || 0) - supportedNaAbsorption;
  completionBasolateralFlux['K+'] = (completionBasolateralFlux['K+'] || 0) + supportedKSecretion;

  const netFlux = {};
  Object.keys(apicalFlux).forEach(ion => { netFlux[ion] = apicalFlux[ion] + basolateralFlux[ion]; });

  const newICF = { ...baseline.icf };
  Object.entries(activeMembraneFlux)
    .filter(([ion]) => !FLUX_ONLY_SOLUTES.includes(ion))
    .forEach(([ion, flux]) => { newICF[ion] += activeCellConcentrationDelta(ion, flux); });
  Object.entries(passiveNetFlux)
    .filter(([ion]) => !FLUX_ONLY_SOLUTES.includes(ion))
    .forEach(([ion, flux]) => { newICF[ion] += flux; });
  Object.entries(hiddenPumpCellFlux)
    .forEach(([ion, flux]) => { newICF[ion] += flux; });
  newICF['H+'] = Math.max(newICF['H+'], 1e-8);
  const surfaceReport = buildSurfaceConcentrations(apicalECF, basolateralECF, apicalFlux, basolateralFlux);
  const apicalSurface = surfaceReport.apicalSurface;
  const basolateralSurface = surfaceReport.basolateralSurface;

  // --- Paracellular Pathway Fluxes ---
  const paraFlux = {};
  Object.keys(baseline.apicalECF).forEach(ion => { paraFlux[ion] = 0; });

  // --- Transepithelial Fluxes using ONLY current tick values ---
  const glucoseTransEpiFlux = transepithelialFlux('Glucose', ['SGLT'], ['GLUT2'], true, apicalFlux, basolateralFlux, tList, hasNaKATPase);
  const aaTransEpiFlux = transepithelialFlux('AA', ['NaAA'], ['AAFacilitator'], true, apicalFlux, basolateralFlux, tList, hasNaKATPase);
  const oaTransEpiFlux = transepithelialFlux('OA-', ['OAT'], ['MRPBCRP'], true, apicalFlux, basolateralFlux, tList, hasNaKATPase);
  const ocTransEpiFlux = transepithelialFlux('OC+', ['OCT'], ['MATE'], false, apicalFlux, basolateralFlux, tList, hasNaKATPase);
  let peptideTransEpiFlux = 0;
  if (tList.some(t => t.id === 'PepT' && t.placement !== 'none') && tList.some(t => t.id === 'AAFacilitator' && t.placement !== 'none')) {
    peptideTransEpiFlux = transepithelialFlux('Peptide', ['PepT'], ['AAFacilitator'], false, apicalFlux, basolateralFlux, tList, hasNaKATPase);
    if (peptideTransEpiFlux === 0) {
      const pepT = tList.find(t => t.id === 'PepT' && t.placement !== 'none');
      const aaExit = tList.find(t => t.id === 'AAFacilitator' && t.placement !== 'none' && t.placement !== pepT.placement);
      if (pepT && aaExit) {
        const pepRate = Math.abs(pepT.kinetics.maxRate / (pepT.kinetics.Km + 1) * pepT.density);
        const aaRate = Math.abs(aaExit.kinetics.maxRate / (aaExit.kinetics.Km + 1) * aaExit.density);
        const limiting = Math.min(pepRate, aaRate);
        peptideTransEpiFlux = pepT.placement === 'apical' ? limiting : -limiting;
      }
    }
  }
  const rawPhosphateTransEpiFlux = transepithelialFlux('Phosphate', NAPI_TRANSPORTER_IDS, ['PiFacilitator'], true, apicalFlux, basolateralFlux, tList, hasNaKATPase);
  const phosphateTransEpiFlux = naPiPhosphateFluxWithNaSupport(rawPhosphateTransEpiFlux, coupledEvents, supportedNaAbsorption);
  const naTransEpiFlux = supportedNaAbsorption;
  const clTransEpiFlux = transepithelialFlux('Cl-', ['NKCC','NCC','ClCKb','AE1','CFTR'], ['NKCC','NCC','ClCKb','AE1','CFTR'], false, apicalFlux, basolateralFlux, tList, hasNaKATPase);
  const caTransEpiFlux = transepithelialFlux('Ca2+', ['TRPV56'], ['PMCA','NCX1'], false, apicalFlux, basolateralFlux, tList, hasNaKATPase);

  // K+ logic (HKATPase or other)
  const hkAtpaseSides = placementsForTick('HKATPase', tList);
  let kTransEpiFlux = 0;
  if (hkAtpaseSides.length > 0) {
    const apicalHK = tList.some(t => t.id === 'HKATPase' && t.placement === 'apical');
    const basolateralHK = tList.some(t => t.id === 'HKATPase' && t.placement === 'basolateral');
    if (apicalHK) kTransEpiFlux += apicalFlux['K+'] ?? 0;
    if (basolateralHK) kTransEpiFlux += basolateralFlux['K+'] ?? 0;
  }
  if (kTransEpiFlux === 0) {
    kTransEpiFlux = supportedKSecretion > 0
      ? -supportedKSecretion
      : transepithelialFlux('K+', ['NKCC','ROMK'], ['ROMK','NaKATPase'], true, completionApicalFlux, completionBasolateralFlux, tList, hasNaKATPase);
  }

  const hExtruders = tList.filter(t => ['NHE3','HATPase','HKATPase'].includes(t.id) && t.placement !== 'none');
  const hco3ExitTransporters = tList.filter(t => ['NBCe1','AE1'].includes(canonicalTransporterId(t.id)) && t.placement !== 'none');
  const directHco3TransEpiFlux = transepithelialFlux('HCO3-', ['NBCe1','AE1'], ['CFTR','AE1'], false, apicalFlux, basolateralFlux, tList, hasNaKATPase);
  let hTransEpiFlux = 0;
  let hco3TransEpiFlux = directHco3TransEpiFlux;
  let acidBaseFluxPairs = [];
  let acidBaseCellSupport = {
    active: false,
    message: null,
    hSupport: 0,
    hco3Support: 0
  };
  if (hExtruders.length > 0 && hco3ExitTransporters.length > 0) {
    const fluxPairs = [];
    for (let t of hExtruders) {
      for (let hco3Exit of hco3ExitTransporters) {
        if (t.placement !== hco3Exit.placement) {
          const pairHasSupport = hasNaKATPase || (t.id !== 'NHE3' && canonicalTransporterId(hco3Exit.id) !== 'NBCe1');
          if (!pairHasSupport) continue;
          const extruderRate = (t.kinetics.maxRate / (t.kinetics.Km + 1)) * t.density;
          const hco3Stoich = Math.abs(hco3Exit.stoich['HCO3-'] || 1);
          const hco3Rate = (hco3Exit.kinetics.maxRate / (hco3Exit.kinetics.Km + 1)) * hco3Exit.density * hco3Stoich;
          const limiting = Math.min(Math.abs(extruderRate), Math.abs(hco3Rate));
          if (t.placement === 'apical' && hco3Exit.placement === 'basolateral') {
            fluxPairs.push({ h: -limiting, hco3: limiting });
          } else if (t.placement === 'basolateral' && hco3Exit.placement === 'apical') {
            fluxPairs.push({ h: limiting, hco3: -limiting });
          }
        }
      }
    }
    acidBaseFluxPairs = fluxPairs;
    hTransEpiFlux = fluxPairs.reduce((sum, p) => sum + p.h, 0);
    hco3TransEpiFlux += fluxPairs.reduce((sum, p) => sum + p.hco3, 0);
  }
  const implicitAcidBaseSupportCapacity = acidBaseFluxPairs.reduce(
    (sum, pair) => sum + Math.min(Math.abs(pair.h || 0), Math.abs(pair.hco3 || 0)),
    0
  );
  if (implicitAcidBaseSupportCapacity > 0) {
    const hSupport = restoreTowardBaseline(newICF, baseline.icf, 'H+', implicitAcidBaseSupportCapacity);
    const hco3Support = restoreTowardBaseline(newICF, baseline.icf, 'HCO3-', implicitAcidBaseSupportCapacity);
    newICF['H+'] = Math.max(newICF['H+'], 1e-8);
    acidBaseCellSupport = {
      active: hco3Support > CELL_IMBALANCE_EPSILON,
      message: hco3Support > CELL_IMBALANCE_EPSILON
        ? 'CO₂ + H₂O is treated as the source of paired H⁺ and HCO₃⁻.'
        : null,
      hSupport,
      hco3Support
    };
  }
  const cellImbalanceReport = buildCellImbalanceReport(baseline.icf, newICF);

  // Compose transepiFluxDataNoH2O
  const transepiFluxDataNoH2O = Object.keys(netFlux).filter(ion => ion !== 'H2O').map(ion => {
    switch (ion) {
      case 'Glucose': return { ion, transepithelial: glucoseTransEpiFlux };
      case 'AA':      return { ion, transepithelial: aaTransEpiFlux };
      case 'Peptide': return { ion, transepithelial: peptideTransEpiFlux };
      case 'OA-':     return { ion, transepithelial: oaTransEpiFlux };
      case 'OC+':     return { ion, transepithelial: ocTransEpiFlux };
      case 'Na+':     return { ion, transepithelial: naTransEpiFlux };
      case 'K+':      return { ion, transepithelial: kTransEpiFlux };
      case 'Cl-':     return { ion, transepithelial: clTransEpiFlux };
      case 'Ca2+':    return { ion, transepithelial: caTransEpiFlux };
      case 'Phosphate': return { ion, transepithelial: phosphateTransEpiFlux };
      case 'HCO3-':   return { ion, transepithelial: hco3TransEpiFlux };
      case 'H+':      return { ion, transepithelial: hTransEpiFlux };
      default:        return { ion, transepithelial: 0 };
    }
  });

  const paracellularIonConfigs = paracellularPermeantIonConfigs(paracellularType, paraCationPerm, paraAnionPerm);
  const paracellularElectricalTendency = solveParacellularElectricalTendency(
    transepiFluxDataNoH2O,
    paracellularIonConfigs,
    apicalSurface,
    basolateralSurface
  );
  const solvedParaFlux = paracellularFluxesForElectricalTendency(
    paracellularIonConfigs,
    apicalSurface,
    basolateralSurface,
    paracellularElectricalTendency
  );
  Object.entries(solvedParaFlux).forEach(([ion, flux]) => {
    paraFlux[ion] = flux;
  });
  Object.keys(netFlux).forEach(ion => { netFlux[ion] += paraFlux[ion] || 0; });

  // Add paracellular fluxes
  if (paracellularType !== 'none') {
    transepiFluxDataNoH2O.forEach(row => {
      if (
        (paracellularType === 'cation' && ['Na+','K+'].includes(row.ion)) ||
        (paracellularType === 'anion' && ['Cl-','HCO3-'].includes(row.ion))
      ) {
        row.transepithelial += paraFlux[row.ion] || 0;
      }
    });
  }

  const matchedDisplayFluxes = buildMatchedDisplayFluxes(
    completionApicalFlux,
    completionBasolateralFlux,
    transepiFluxDataNoH2O,
    paraFlux
  );

  const acidBaseRows = Object.fromEntries(transepiFluxDataNoH2O.map(row => [row.ion, row.transepithelial || 0]));
  const acidBaseValue = -(acidBaseRows['H+'] || 0) + (acidBaseRows['HCO3-'] || 0);
  const acidBaseReport = {
    apicalSurface: surfacePHDirection(apicalFlux['H+'] || 0),
    cell: cellPHDirection(netFlux['H+'] || 0, netFlux['HCO3-'] || 0),
    cellNote: acidBaseCellSupport.message,
    cellSupport: acidBaseCellSupport,
    basolateralSurface: surfacePHDirection(basolateralFlux['H+'] || 0),
    transepithelial: {
      label: 'Net epithelial acid/base',
      direction: epithelialAcidBaseDirection(acidBaseValue),
      strength: tendencyStrength(acidBaseValue),
      value: acidBaseValue
    }
  };

  const coupledMismatchReport = buildCoupledMismatchReport(coupledEvents, transepiFluxDataNoH2O);
  const effectiveBackgroundOsmoticPull = resolveBackgroundOsmoticPull(tissuePreset, backgroundOsmoticPullSetting);

  const waterReport = buildWaterReport(
    tList,
    paracellularType,
    transepiFluxDataNoH2O,
    effectiveBackgroundOsmoticPull
  );

  // Compose transepiFluxData for display
  const transepiFluxData = [
    ...transepiFluxDataNoH2O,
    { ion: 'H2O', transepithelial: waterReport.netTransepithelial.value }
  ];
  const apicalKirKExit = kirPassiveEvents
    .filter(event => event.placement === 'apical' && event.flux < -DIRECTIONAL_FLUX_GRAPH_EPSILON)
    .reduce((sum, event) => sum + Math.max(-event.flux, 0), 0);
  const apicalKLoadingForRecycling = Math.max(Number(activeApicalFlux['K+'] || 0), 0);
  const apicalKRecyclingTep = Math.min(apicalKirKExit, apicalKLoadingForRecycling) *
    APICAL_K_RECYCLING_TEP_COUPLING;
  const chargeReport = buildChargeReport(apicalFlux, basolateralFlux, transepiFluxData, apicalKRecyclingTep);

  // Push results
  setResult({
    apicalFlux,
    basolateralFlux,
    netFlux,
    concentrations: {
      apicalECF,
      apicalSurface,
      icf: newICF,
      basolateralSurface,
      basolateralECF
    },
    surfaceReport,
    paraFlux,
    displayApicalFlux: matchedDisplayFluxes.displayApicalFlux,
    displayBasolateralFlux: matchedDisplayFluxes.displayBasolateralFlux,
    electrochemicalContextEvents,
    fluxEvents,
    transepiFluxData,
    waterReport,
    pumpSupportReport,
    chargeReport,
    coupledMismatchReport,
    cellImbalanceReport,
    acidBaseReport,
    paracellularElectricalTendency,
    gradientSupportReport: {
      present: pumpSupportProfile.present,
      strength: pumpSupportProfile.gradientStrength,
      capacity: pumpSupportProfile.naExtrusionCapacity,
      normalCapacity: pumpSupportProfile.normalCapacity,
      label: naKATPaseSupportLabel(pumpSupportProfile)
    }
  });
};


  // --- Derived Data for Display ---
  const acidBaseReport = result?.acidBaseReport;
  const settingsConcentrations = {
    ...baseConcentrations,
    icf: deriveEffectiveStartingIcf(baseConcentrations, transporters)
  };
  const tissueOption = TISSUE_OPTIONS.find(option => option.value === tissuePreset) || TISSUE_OPTIONS[0];
  const displayOrientation = displayOrientationForTissue(tissueOption);
  const allTissueOption = TISSUE_OPTIONS[0];
  const selectableTissueOptions = TISSUE_OPTIONS.filter(isSelectableTissueOption);
  const selectedTissueLimitation = TISSUE_LIMITATION_NOTES[tissueOption.value] || null;
  const tissueLimitationRows = Object.entries(TISSUE_LIMITATION_NOTES).map(([value, note]) => ({
    value,
    note,
    label: TISSUE_OPTIONS.find(option => option.value === value)?.label || value
  }));
  const groupedTissueOptions = TISSUE_OPTION_GROUPS.map(group => ({
    group,
    options: selectableTissueOptions.filter(option => option.group === group)
  })).filter(group => group.options.length > 0);
  const visibleTransporterIds = new Set(tissueOption.transporterIds);
  const orientText = text => {
    if (!text || displayOrientation === DISPLAY_ORIENTATIONS.epithelial) return text;
    return String(text)
      .replace(/toward blood/g, displayOrientation.positiveFluxLabel)
      .replace(/toward lumen/g, displayOrientation.negativeFluxLabel)
      .replace(/absorption/g, displayOrientation.positiveProcessLabel)
      .replace(/secretion/g, displayOrientation.negativeProcessLabel)
      .replace(/Lumen/g, displayOrientation.apicalPolarityLabel)
      .replace(/lumen/g, displayOrientation.apicalShortLabel.toLowerCase())
      .replace(/Blood/g, displayOrientation.basolateralPolarityLabel)
      .replace(/blood/g, displayOrientation.basolateralShortLabel.toLowerCase());
  };
  const directionLabelForValue = value => {
    const numeric = Number(value ?? 0);
    if (Math.abs(numeric) < 0.001) return 'none';
    return numeric > 0 ? displayOrientation.positiveProcessLabel : displayOrientation.negativeProcessLabel;
  };
  const towardLabelForValue = value => {
    const numeric = Number(value ?? 0);
    if (Math.abs(numeric) < 0.001) return 'neutral/weak';
    return numeric > 0 ? displayOrientation.positiveFluxLabel : displayOrientation.negativeFluxLabel;
  };
  const polarityStatus = value => {
    if (Math.abs(value) < CHARGE_EPSILON) return 'Minimal';
    return value > 0
      ? displayOrientation.apicalPolarityLabel + '-positive'
      : displayOrientation.apicalPolarityLabel + '-negative';
  };
  const fluxDirectionCaption = 'Positive = ' + displayOrientation.positiveFluxLabel + '; negative = ' + displayOrientation.negativeFluxLabel + '.';
  const fluxBarSeries = FLUX_BAR_SERIES.map(series => {
    if (series.key === 'apicalStep') return { ...series, name: displayOrientation.apicalMembraneLabel };
    if (series.key === 'basolateralStep') return { ...series, name: displayOrientation.basolateralMembraneLabel };
    return series;
  });
  const concentrationCompartments = CONCENTRATION_COMPARTMENTS.map(compartment => {
    if (displayOrientation === DISPLAY_ORIENTATIONS.epithelial) return compartment;
    if (compartment.key === 'apicalBulk') return { ...compartment, label: displayOrientation.apicalShortLabel + ' Bulk ECF', name: displayOrientation.apicalShortLabel + ' Bulk ECF' };
    if (compartment.key === 'apicalSurface') return { ...compartment, label: displayOrientation.apicalShortLabel + ' Surface ECF', name: displayOrientation.apicalShortLabel + ' Surface ECF' };
    if (compartment.key === 'basolateralSurface') return { ...compartment, label: displayOrientation.basolateralShortLabel + ' Surface ECF', name: displayOrientation.basolateralShortLabel + ' Surface ECF' };
    if (compartment.key === 'basolateralBulk') return { ...compartment, label: displayOrientation.basolateralShortLabel + ' Bulk ECF', name: displayOrientation.basolateralShortLabel + ' Bulk ECF' };
    return compartment;
  });
  const settingsConcentrationCompartments = SETTINGS_CONCENTRATION_COMPARTMENTS.map(compartment => {
    if (displayOrientation === DISPLAY_ORIENTATIONS.epithelial) return compartment;
    if (compartment.key === 'apicalECF') return { ...compartment, label: displayOrientation.apicalShortLabel + ' bath' };
    if (compartment.key === 'basolateralECF') return { ...compartment, label: displayOrientation.basolateralShortLabel + ' bath' };
    return compartment;
  });

  const concentrationIons = result
    ? Object.keys(result.concentrations.icf).filter(ion => ion !== 'H2O' && !GENERAL_DISPLAY_EXCLUDED_IONS.includes(ion))
    : [];
  const concData = concentrationIons.map(ion => ({
    ionKey: ion,
    ion: ION_LABEL[ion] || ion,
    apicalBulk: result.concentrations.apicalECF[ion],
    apicalSurface: result.concentrations.apicalSurface?.[ion] ?? result.concentrations.apicalECF[ion],
    icf: result.concentrations.icf[ion],
    basolateralSurface: result.concentrations.basolateralSurface?.[ion] ?? result.concentrations.basolateralECF[ion],
    basolateralBulk: result.concentrations.basolateralECF[ion]
  }));
  const concTableData = concentrationIons.map(ion => ({
    ionKey: ion,
    ion: ION_LABEL[ion] || ion,
    apicalBulk: result.concentrations.apicalECF[ion],
    apicalSurface: result.concentrations.apicalSurface?.[ion] ?? result.concentrations.apicalECF[ion],
    icf: result.concentrations.icf[ion],
    basolateralSurface: result.concentrations.basolateralSurface?.[ion] ?? result.concentrations.basolateralECF[ion],
    basolateralBulk: result.concentrations.basolateralECF[ion]
  }));
  const openConcentrationZoomFromChart = data => {
    const ionKey = data?.payload?.ionKey || data?.activePayload?.[0]?.payload?.ionKey;
    if (ionKey) setZoomedConcentrationIon(ionKey);
  };
  const zoomedConcentrationRow = zoomedConcentrationIon
    ? concData.find(row => row.ionKey === zoomedConcentrationIon)
    : null;
  const zoomedConcentrationData = zoomedConcentrationRow
    ? concentrationCompartments.map(compartment => ({
        compartment: compartment.label,
        concentration: Number(zoomedConcentrationRow[compartment.key] ?? 0)
      }))
    : [];
  const zoomedConcentrationMax = zoomedConcentrationData.reduce((max, row) => Math.max(max, row.concentration), 0);
  const zoomedConcentrationDomainMax = niceConcentrationAxisMax(zoomedConcentrationMax);
  const ConcentrationTooltip = ({ active, payload, label }) => {
    if (!active || !payload || payload.length === 0) return null;
    const row = payload[0]?.payload;
    if (!row) return null;
    return (
      <div className="bg-white border rounded shadow-lg p-2 text-xs text-gray-700 max-w-xs">
        <div className="font-semibold text-sm mb-1">{label}</div>
        <div className="space-y-0.5">
          {payload.map(item => (
            <div key={item.dataKey} className="flex items-center justify-between gap-4">
              <span>{item.name}</span>
              <span className="font-mono">{Number(item.value ?? 0).toFixed(3)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

// For H⁺/K⁺-ATPase, K⁺ flux can occur with HKATPase on either membrane (no exit needed).
// Parallel/mirrored H⁺ and HCO₃⁻ TE flux logic uses pathway completion rules rather than buffered pH kinetics.
  const transepiFluxData = result?.transepiFluxData || [];
  const soluteTransepiFluxData = transepiFluxData.filter(row => row.ion !== 'H2O');
  const transepithelialByIon = Object.fromEntries(soluteTransepiFluxData.map(row => [row.ion, row.transepithelial || 0]));
  const displayApicalFlux = result?.displayApicalFlux || result?.apicalFlux || {};
  const displayBasolateralFlux = result?.displayBasolateralFlux || result?.basolateralFlux || {};
  const directionalFluxRows = result
    ? FLUX_GROUPS.flatMap(group => group.solutes.map(ion => ({
      group: group.key,
      groupLabel: group.label,
      ion,
      label: ION_LABEL[ion] || ion,
      apicalStep: displayApicalFlux[ion] || 0,
      basolateralStep: -(displayBasolateralFlux[ion] || 0),
      paracellularStep: result.paraFlux[ion] || 0,
      transepithelial: transepithelialByIon[ion] || 0
    })))
    : [];
  const directionalFluxGroups = FLUX_GROUPS.map(group => ({
    ...group,
    rows: directionalFluxRows.filter(row => row.group === group.key)
  }));
  const visibleDirectionalFluxGroups = directionalFluxGroups.filter(group =>
    group.key === 'ions' ||
      group.rows.some(row =>
      ['apicalStep', 'basolateralStep', 'paracellularStep', 'transepithelial']
        .some(key => Math.abs(Number(row[key] || 0)) > DIRECTIONAL_FLUX_GRAPH_EPSILON)
    )
  );
  const visibleIonDirectionalFluxGroups = visibleDirectionalFluxGroups.filter(group => group.key === 'ions');
  const visibleSupplementalDirectionalFluxGroups = visibleDirectionalFluxGroups.filter(group => group.key !== 'ions');

  const modalTransporter = INITIAL_TRANSPORTERS.find(t => t.id === canonicalTransporterId(modalTransporterId));
  const transporterTemplateById = id => INITIAL_TRANSPORTERS.find(t => t.id === canonicalTransporterId(id));
  const membraneTransporters = placement => transporters.filter(t => t.placement === placement);
  const transporterIsOnMembrane = (id, placement) => transporters.some(t => t.id === id && t.placement === placement);
  const effectiveBackgroundOsmoticPull = resolveBackgroundOsmoticPull(tissueOption.value, backgroundOsmoticPullSetting);
  const showTransporterTooltip = (event, tooltipId, description) => {
    if (!description) return;
    if (tooltipHideTimerRef.current) clearTimeout(tooltipHideTimerRef.current);
    const rect = event.currentTarget.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1024;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 768;
    const margin = 8;
    const words = String(description).split(/\s+/).filter(Boolean);
    const longestWord = words.reduce((max, word) => Math.max(max, word.length), 0);
    const estimatedChars = Math.min(String(description).length, Math.max(longestWord, 18));
    const width = Math.min(Math.max(140, Math.ceil(estimatedChars * 6.5) + 20), Math.min(210, viewportWidth - margin * 2));
    const estimatedHeight = Math.max(72, Math.ceil(String(description).length / 26) * 18);
    const left = Math.min(Math.max(rect.left, margin), viewportWidth - width - margin);
    const top = rect.bottom + estimatedHeight + margin > viewportHeight
      ? Math.max(margin, rect.top - estimatedHeight - 6)
      : rect.bottom + 6;
    setActiveTransporterTooltip({ id: tooltipId, description, left, top, width });
  };
  const keepTransporterTooltipOpen = () => {
    if (tooltipHideTimerRef.current) clearTimeout(tooltipHideTimerRef.current);
  };
  const hideTransporterTooltip = () => {
    if (tooltipHideTimerRef.current) clearTimeout(tooltipHideTimerRef.current);
    tooltipHideTimerRef.current = setTimeout(() => setActiveTransporterTooltip(null), 120);
  };

  const renderTransporterChooser = placement => (
    <div className="space-y-3">
      {TRANSPORTER_GROUPS.map(group => ({
        ...group,
        ids: group.ids.filter(id => visibleTransporterIds.has(id))
      })).filter(group => group.ids.length > 0).map(group => (
        <div key={group.label}>
          <div className="text-xs font-semibold text-gray-600 mb-1">{group.label}</div>
          <div className="flex flex-wrap gap-1">
            {group.ids.map(id => {
              const template = transporterTemplateById(id);
              const alreadyAdded = transporterIsOnMembrane(id, placement);
              const description = TRANSPORTER_DESCRIPTIONS[id] || '';
              const tooltipId = 'transporter-tooltip-' + placement + '-' + id;
              const descriptionId = 'transporter-description-' + placement + '-' + id;
              return (
                <span
                  key={id}
                  className="relative inline-block"
                  onMouseEnter={event => showTransporterTooltip(event, tooltipId, description)}
                  onMouseLeave={hideTransporterTooltip}
                  onFocus={event => showTransporterTooltip(event, tooltipId, description)}
                  onBlur={hideTransporterTooltip}
                >
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={alreadyAdded}
                    aria-label={'Add ' + (template?.name || id)}
                    aria-describedby={description ? descriptionId : undefined}
                    className={alreadyAdded ? 'text-gray-400 border-gray-200 bg-gray-50' : ''}
                    onClick={() => addTransporterToMembrane(id, placement)}
                  >
                    {template?.name || id}
                  </Button>
                  {description && (
                    <span id={descriptionId} className="sr-only">
                      {description}
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );

  const renderTransporterRows = placement => {
    const rows = membraneTransporters(placement);
    const placementMembraneLabel = placement === 'apical'
      ? displayOrientation.apicalMembraneLabel
      : displayOrientation.basolateralMembraneLabel;
    if (rows.length === 0) {
      return <div className="text-sm text-gray-500 border rounded p-2 bg-gray-50">No transporters added.</div>;
    }

    return (
      <div className="space-y-2">
        {rows.map(t => (
          <div key={t.uid} className="border rounded p-2 bg-white">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="font-semibold text-sm">{t.name}</div>
              <Button
                size="sm"
                variant="outline"
                aria-label={'Remove ' + t.name + ' from ' + placementMembraneLabel}
                onClick={() => removeTransporter(t.uid)}
              >
                Remove
              </Button>
            </div>
            <fieldset className="flex items-center gap-2 text-xs">
              <legend className="text-gray-600 mr-1">Density</legend>
              {DENSITY_OPTIONS.map(option => (
                <label key={option.label} className="inline-flex items-center gap-1">
                  <input
                    type="radio"
                    name={'density-' + t.uid}
                    value={option.value}
                    checked={t.density === option.value}
                    onChange={() => updateTransporter(t.uid, 'density', option.value)}
                  />
                  {option.label}
                </label>
              ))}
            </fieldset>
          </div>
        ))}
      </div>
    );
  };

  const renderMembraneBuilder = (placement, title) => (
    <section className="border rounded p-3 bg-gray-50">
      <h2 className="text-base font-semibold mb-2">{title}</h2>
      <div className="mb-3">
        {renderTransporterRows(placement)}
      </div>
      <details className="bg-white border rounded p-2">
        <summary className="cursor-pointer text-sm font-semibold">Add transporter</summary>
        <div className="mt-3">
          {renderTransporterChooser(placement)}
        </div>
      </details>
    </section>
  );

  const waterReport = result?.waterReport;
  const formatWaterValue = value => Number(value ?? 0).toFixed(1);
  const chargeReport = result?.chargeReport;
  const coupledMismatchReport = result?.coupledMismatchReport;
  const cellImbalanceReport = result?.cellImbalanceReport || [];
  const cellImbalanceRows = cellImbalanceReport.length
    ? cellImbalanceReport
    : [{ label: 'None', direction: 'No intracellular imbalance tendency detected', change: 0 }];
  const formatChargeValue = value => Number(value ?? 0).toFixed(2);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const formatTableValue = value => Number(value ?? 0).toFixed(3);
  const formatCompactFluxValue = value => {
    const numeric = Number(value ?? 0);
    if (!Number.isFinite(numeric)) return '0';
    return String(Number(Math.abs(numeric).toFixed(3)));
  };
  const formatSettingsConcentration = value => {
    const numeric = Number(value ?? 0);
    if (!Number.isFinite(numeric)) return '0';
    if (numeric !== 0 && Math.abs(numeric) < 0.001) return numeric.toPrecision(2);
    return String(Number(numeric.toFixed(3)));
  };
  const concentrationValidationFor = (compartment, ion) => concentrationValidation[compartment + '-' + ion];
  const fluxDirection = value => {
    if (displayOrientation === DISPLAY_ORIENTATIONS.epithelial) return directionLabelForValue(value);
    const numeric = Number(value ?? 0);
    if (Math.abs(numeric) < 0.001) return 'none';
    return numeric > 0 ? displayOrientation.positiveFluxLabel : displayOrientation.negativeFluxLabel;
  };
  const hasIntracellularImbalance = cellImbalanceReport.length > 0;
  const hasCoupledMismatch = coupledMismatchReport?.state === 'mismatch';
  const compactImbalanceDirection = direction => direction.replace(' tendency', '');
  const acidBaseCellTendency = acidBaseReport?.cell || '';
  const hasCellAcidBaseImbalance = acidBaseCellTendency === 'cell tends acidified' || acidBaseCellTendency === 'cell tends alkalinized';
  const acidBaseCellWarning = hasCellAcidBaseImbalance
    ? 'Acid/base imbalance: ' + acidBaseCellTendency
    : null;
  const tePotentialValue = chargeReport?.transepithelial?.value ?? 0;
  const osmoticPullValue = waterReport?.osmoticPull?.value ?? 0;
  const waterFluxValue = waterReport?.netTransepithelial?.value ?? 0;
  const acidBaseFluxValue = acidBaseReport?.transepithelial?.value ?? 0;
  const tePotentialStatus = polarityStatus(tePotentialValue);
  const osmoticPullStatus = towardLabelForValue(osmoticPullValue);
  const waterFluxStatus = towardLabelForValue(waterFluxValue);
  const acidBaseFluxStatus = Math.abs(acidBaseFluxValue) < 0.001
    ? 'Neutral/weak'
    : acidBaseFluxValue > 0
      ? 'Acid ' + displayOrientation.negativeProcessLabel
      : 'Base ' + displayOrientation.negativeProcessLabel;
  const netFluxRows = soluteTransepiFluxData
    .filter(row => Math.abs(Number(row.transepithelial || 0)) >= 0.005)
    .map(row => ({
      ion: row.ion,
      label: ION_LABEL[row.ion] || row.ion,
      value: Number(row.transepithelial || 0)
    }));
  const absorbedFluxRows = netFluxRows.filter(row => row.value > 0);
  const secretedFluxRows = netFluxRows.filter(row => row.value < 0);
  const fluxSummaryStatus = netFluxRows.length
    ? absorbedFluxRows.length + ' absorbed; ' + secretedFluxRows.length + ' secreted'
    : 'No strong net solute flux';
  const fluxSummarySections = [
    {
      label: displayOrientation === DISPLAY_ORIENTATIONS.epithelial ? 'Absorbed' : displayOrientation.positiveFluxLabel,
      rows: absorbedFluxRows
    },
    {
      label: displayOrientation === DISPLAY_ORIENTATIONS.epithelial ? 'Secreted' : displayOrientation.negativeFluxLabel,
      rows: secretedFluxRows
    }
  ];
  const cellBalanceStatus = hasIntracellularImbalance
    ? cellImbalanceReport.length === 1
      ? cellImbalanceReport[0].label + ' ' + compactImbalanceDirection(cellImbalanceReport[0].direction)
      : cellImbalanceReport.length + ' tendencies'
    : hasCellAcidBaseImbalance
      ? acidBaseCellWarning
    : hasCoupledMismatch
      ? 'Coupled mismatch'
      : 'Balanced';
  const cellBalanceDetail = hasIntracellularImbalance
    ? hasCellAcidBaseImbalance
      ? acidBaseCellWarning
      : cellImbalanceReport.length === 1
      ? 'Intracellular ' + compactImbalanceDirection(cellImbalanceReport[0].direction)
      : 'Review imbalance table below'
    : hasCellAcidBaseImbalance
      ? 'Review Acid/Base & pH below'
    : hasCoupledMismatch
      ? 'Review pathway completion'
      : 'No major intracellular imbalance';
  const hasBackgroundPull = waterReport && Math.abs(Number(waterReport.backgroundPull?.value || 0)) >= WATER_EPSILON;
  const backgroundPullStatus = hasBackgroundPull
    ? orientText(String(waterReport.backgroundPull.status || '').replace(/^Tissue default/, 'tissue default'))
    : null;
  const waterFluxDetail = hasBackgroundPull
    ? 'Background pull: ' + backgroundPullStatus
    : null;
  const snapshotIndicatorPercent = (value, maxAbs) => 50 + clamp(Number(value || 0) / maxAbs, -1, 1) * 45;
  const resultsSnapshotTiles = result ? [
    {
      key: 'flux-summary',
      title: 'Net Flux Summary',
      status: fluxSummaryStatus,
      detail: netFluxRows.length ? null : 'Net epithelial solute movement is weak',
      state: netFluxRows.length ? 'accent' : 'neutral',
      fluxSections: fluxSummarySections
    },
    {
      key: 'balance',
      title: 'Cell Balance',
      status: cellBalanceStatus,
      detail: cellBalanceDetail,
      state: hasIntracellularImbalance || hasCellAcidBaseImbalance || hasCoupledMismatch ? 'warning' : 'good'
    },
    {
      key: 'tep',
      title: 'Transepithelial Potential',
      status: tePotentialStatus,
      detail: chargeReport
        ? chargeReport.transepithelial.strength + '; ' + formatChargeValue(tePotentialValue) + ' charge units'
        : 'No charge tendency calculated',
      state: Math.abs(tePotentialValue) < CHARGE_EPSILON ? 'neutral' : 'accent',
      indicator: {
        value: tePotentialValue,
        maxAbs: SNAPSHOT_TEP_INDICATOR_MAX,
        leftLabel: displayOrientation.apicalPolarityLabel + '-negative',
        rightLabel: displayOrientation.apicalPolarityLabel + '-positive',
        markerClass: 'bg-slate-700',
        ariaLabel: 'Transepithelial potential indicator: ' + tePotentialStatus + ', ' + formatChargeValue(tePotentialValue) + ' charge units. Left indicates ' + displayOrientation.apicalPolarityLabel + '-negative; right indicates ' + displayOrientation.apicalPolarityLabel + '-positive.'
      }
    },
    {
      key: 'acid-base',
      title: 'Net Acid/Base Flux',
      status: acidBaseFluxStatus,
      detail: acidBaseReport
        ? orientText(acidBaseReport.transepithelial.direction) + '; ' + acidBaseReport.transepithelial.strength
        : 'No acid/base tendency calculated',
      state: Math.abs(acidBaseFluxValue) < 0.001 ? 'neutral' : 'accent',
      indicator: {
        value: acidBaseFluxValue,
        maxAbs: SNAPSHOT_ACID_BASE_INDICATOR_MAX,
        leftLabel: 'Base ' + displayOrientation.negativeProcessLabel,
        rightLabel: 'Acid ' + displayOrientation.negativeProcessLabel,
        markerClass: 'bg-teal-700',
        ariaLabel: 'Net acid/base flux indicator: ' + acidBaseFluxStatus + ', ' + formatChargeValue(acidBaseFluxValue) + ' acid/base units. Left indicates base ' + displayOrientation.negativeProcessLabel + '; right indicates acid ' + displayOrientation.negativeProcessLabel + '.'
      }
    },
    {
      key: 'water',
      title: 'Water Flux',
      status: null,
      detail: waterFluxDetail,
      detailBadge: hasBackgroundPull,
      detailAriaLabel: hasBackgroundPull ? 'Background osmotic pull is active: ' + backgroundPullStatus : undefined,
      state: Math.abs(osmoticPullValue) < WATER_EPSILON && Math.abs(waterFluxValue) < WATER_EPSILON ? 'neutral' : 'accent',
      indicators: [
        {
          label: 'Osmotic pull',
          status: osmoticPullStatus,
          value: osmoticPullValue,
          maxAbs: SNAPSHOT_WATER_INDICATOR_MAX,
          leftLabel: displayOrientation.negativeFluxLabel,
          rightLabel: displayOrientation.positiveFluxLabel,
          markerClass: 'bg-indigo-700',
          ariaLabel: 'Osmotic pull indicator: ' + osmoticPullStatus + ', ' + formatWaterValue(osmoticPullValue) + ' osmotic pull tendency units. Left indicates ' + displayOrientation.negativeFluxLabel + '; right indicates ' + displayOrientation.positiveFluxLabel + '.'
        },
        {
          label: 'Water flux',
          status: waterFluxStatus,
          value: waterFluxValue,
          maxAbs: SNAPSHOT_WATER_INDICATOR_MAX,
          leftLabel: displayOrientation.negativeFluxLabel,
          rightLabel: displayOrientation.positiveFluxLabel,
          markerClass: 'bg-blue-600',
          ariaLabel: 'Water flux indicator: ' + waterFluxStatus + ', ' + formatWaterValue(waterFluxValue) + ' water tendency units. Left indicates ' + displayOrientation.negativeFluxLabel + '; right indicates ' + displayOrientation.positiveFluxLabel + '.'
        }
      ]
    }
  ] : [];
  const waterDetailRows = waterReport ? [
    {
      label: 'Osmotic pull',
      status: null,
      direction: orientText(waterReport.osmoticPull.direction),
      strength: waterReport.osmoticPull.strength,
      value: waterReport.osmoticPull.value,
      note: 'Net epithelial solute flux: ' + formatTableValue(waterReport.osmoticPull.sourceFlux) + ' flux units'
    },
    {
      label: 'Background osmotic pull',
      statusLabel: 'Setting',
      status: orientText(waterReport.backgroundPull.status),
      direction: orientText(waterReport.backgroundPull.direction),
      strength: waterReport.backgroundPull.strength,
      value: waterReport.backgroundPull.value,
      note: null
    },
    {
      label: 'Transcellular water pathway and contribution',
      statusLabel: 'Pathway',
      status: waterReport.transcellularPath.status,
      direction: orientText(waterReport.transcellular.direction),
      strength: waterReport.transcellular.strength,
      value: waterReport.transcellular.value,
      note: null
    },
    {
      label: 'Paracellular water pathway and contribution',
      statusLabel: 'Pathway',
      status: waterReport.paracellularPath.status,
      direction: orientText(waterReport.paracellular.direction),
      strength: waterReport.paracellular.strength,
      value: waterReport.paracellular.value,
      note: null
    },
    {
      label: 'Net water flux',
      status: null,
      direction: orientText(waterReport.netTransepithelial.direction),
      strength: waterReport.netTransepithelial.strength,
      value: waterReport.netTransepithelial.value,
      note: null
    }
  ] : [];
  const electrochemicalSideName = placement => {
    if (displayOrientation === DISPLAY_ORIENTATIONS.epithelial) {
      return placement === 'apical' ? 'lumen' : 'blood';
    }
    return placement === 'apical'
      ? displayOrientation.apicalShortLabel.toLowerCase()
      : displayOrientation.basolateralShortLabel.toLowerCase();
  };
  const electrochemicalPathwayLabel = event => {
    const side = event.placement === 'apical'
      ? displayOrientation.apicalShortLabel
      : displayOrientation.basolateralShortLabel;
    return side + ' ' + event.name;
  };
  const electrochemicalDirectionText = (placement, signal, nearLabel = 'near-balanced') => {
    if (Math.abs(Number(signal) || 0) < ELECTROCHEMICAL_CONTEXT_EPSILON) return nearLabel;
    const side = electrochemicalSideName(placement);
    return signal > 0 ? side + ' → cell' : 'cell → ' + side;
  };
  const electrochemicalInterpretation = event => {
    const ion = event.ion;
    const ionLabel = ION_LABEL[ion] || ion;
    const netSignal = Number(event.netSignal || 0);
    const netSign = Math.abs(netSignal) < ELECTROCHEMICAL_CONTEXT_EPSILON || Math.abs(Number(event.flux || 0)) < DIRECTIONAL_FLUX_GRAPH_EPSILON
      ? 0
      : Math.sign(netSignal);
    const side = electrochemicalSideName(event.placement);
    if (netSign === 0) return 'channel present, but no strong net driving force';
    if (ion === 'Na+') return netSign > 0 ? 'supports Na⁺ entry' : 'supports Na⁺ exit';
    if (ion === 'Ca2+') return netSign > 0 ? 'supports Ca²⁺ entry' : 'supports Ca²⁺ exit';
    if (ion === 'K+') {
      if (netSign < 0) return event.placement === 'basolateral' ? 'supports K⁺ recycling' : 'supports K⁺ secretion';
      return 'supports K⁺ entry from ' + side;
    }
    if (ion === 'Cl-') {
      if (netSign < 0) return event.placement === 'apical' ? 'supports Cl⁻ secretion' : 'supports basolateral Cl⁻ exit';
      return event.placement === 'basolateral' ? 'supports Cl⁻ loading from ' + side : 'supports Cl⁻ entry from ' + side;
    }
    if (ion === 'HCO3-') {
      if (netSign < 0) return event.placement === 'apical' ? 'supports HCO₃⁻ secretion' : 'supports basolateral HCO₃⁻ exit';
      return event.placement === 'basolateral' ? 'supports HCO₃⁻ loading from ' + side : 'supports HCO₃⁻ entry from ' + side;
    }
    return netSign > 0 ? 'supports ' + ionLabel + ' entry' : 'supports ' + ionLabel + ' exit';
  };
  const electrochemicalContextRows = result?.electrochemicalContextEvents?.length
    ? result.electrochemicalContextEvents.map(event => ({
        pathway: electrochemicalPathwayLabel(event),
        ion: ION_LABEL[event.ion] || event.ion,
        chemical: electrochemicalDirectionText(event.placement, event.chemicalSignal),
        electrical: event.electricalApplied
          ? electrochemicalDirectionText(event.placement, event.electricalSignal)
          : 'not applied',
        net: electrochemicalDirectionText(event.placement, event.netSignal, 'weak / near-balanced'),
        interpretation: electrochemicalInterpretation(event)
      }))
    : [];
  const electrochemicalTableRows = electrochemicalContextRows.length
    ? electrochemicalContextRows
    : [{
        pathway: 'None',
        ion: 'none',
        chemical: 'none',
        electrical: 'not applied',
        net: 'no strong net tendency',
        interpretation: 'Add ENaC, Kir, ClC, CFTR, or TRPV5/6 to show channel electrochemical context'
      }];

  const snapshotTileClass = tile => {
    const stateClass = {
      good: 'border-emerald-200 bg-emerald-50',
      warning: 'border-amber-300 bg-amber-50',
      accent: 'border-sky-200 bg-sky-50',
      neutral: 'border-gray-200 bg-gray-50'
    }[tile.state] || 'border-gray-200 bg-gray-50';
    const hasMeter = tile.indicator || tile.indicators?.length;
    const hasFluxSections = tile.fluxSections?.length;
    const sizeClass = hasMeter || hasFluxSections ? 'min-h-[116px]' : 'min-h-[92px]';
    return 'h-full rounded border p-2 ' + sizeClass + ' ' + stateClass;
  };
  const snapshotStatusClass = state => ({
    good: 'text-emerald-800',
    warning: 'text-amber-800',
    accent: 'text-sky-900',
    neutral: 'text-gray-800'
  }[state] || 'text-gray-800');
  const SnapshotIndicator = ({ indicator }) => {
    if (!indicator) return null;
    const markerLeft = snapshotIndicatorPercent(indicator.value, indicator.maxAbs);
    return (
      <div className="mt-2" role="img" aria-label={indicator.ariaLabel}>
        {indicator.label && (
          <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
            <span className="font-semibold text-gray-700">{indicator.label}</span>
            <span className="font-semibold text-gray-700">{indicator.status}</span>
          </div>
        )}
        <div className="relative h-2 rounded-full bg-gray-200" aria-hidden="true">
          <div className="absolute left-1/2 top-0 h-full w-px bg-gray-400" />
          <div
            className={'absolute top-1/2 h-3 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded ' + indicator.markerClass}
            style={{ left: markerLeft + '%' }}
          />
        </div>
        <div className="mt-1 flex justify-between gap-2 text-xs text-gray-500">
          <span>{indicator.leftLabel}</span>
          <span>Neutral</span>
          <span>{indicator.rightLabel}</span>
        </div>
      </div>
    );
  };
  const SnapshotTile = ({ tile }) => (
    <li className={snapshotTileClass(tile)}>
      <h3 className="text-xs font-semibold uppercase text-gray-600">{tile.title}</h3>
      {tile.status && (
        <div className={'mt-1 text-sm font-semibold leading-snug ' + snapshotStatusClass(tile.state)}>{tile.status}</div>
      )}
      {tile.detail && (
        <div
          className={tile.detailBadge
            ? 'mt-2 inline-flex rounded border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-medium leading-snug text-indigo-800'
            : 'mt-1 text-xs leading-snug text-gray-600'}
          aria-label={tile.detailAriaLabel}
        >
          {tile.detail}
        </div>
      )}
      {tile.fluxSections && (
        <div className="mt-2 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
          {tile.fluxSections.map(section => (
            <div key={section.label}>
              <div className="mb-1 font-semibold text-gray-700">{section.label}</div>
              {section.rows.length ? (
                <ul className="space-y-0.5 text-gray-700">
                  {section.rows.map(row => (
                    <li key={row.ion} className="flex justify-between gap-2">
                      <span>{row.label}</span>
                      <span className="font-mono">{formatCompactFluxValue(row.value)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-gray-500">None</div>
              )}
            </div>
          ))}
        </div>
      )}
      <SnapshotIndicator indicator={tile.indicator} />
      {tile.indicators?.map(indicator => (
        <SnapshotIndicator key={indicator.label} indicator={indicator} />
      ))}
    </li>
  );
  const WaterDetailCards = ({ rows }) => (
    <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 text-sm mb-3" aria-label="Water movement details">
      {rows.map(row => (
        <li key={row.label} className="border rounded p-3 bg-white">
          <h4 className="font-semibold">{row.label}</h4>
          <dl className="mt-1 space-y-1">
            <div className="grid grid-cols-[auto_1fr] gap-x-2">
              <dt className="font-medium text-gray-600">Direction</dt>
              <dd>{row.direction}</dd>
            </div>
            {row.status && (
              <div className="grid grid-cols-[auto_1fr] gap-x-2 text-gray-600">
                <dt className="font-medium">{row.statusLabel || 'Status'}</dt>
                <dd>{row.status}</dd>
              </div>
            )}
            <div className="grid grid-cols-[auto_1fr] gap-x-2 text-gray-600">
              <dt className="font-medium">Strength</dt>
              <dd>{row.strength}</dd>
            </div>
            <div className="grid grid-cols-[auto_1fr] gap-x-2 text-gray-500">
              <dt className="font-medium">Value</dt>
              <dd>{formatWaterValue(row.value)} tendency units</dd>
            </div>
            {row.note && (
              <div className="grid grid-cols-[auto_1fr] gap-x-2 text-gray-500 leading-snug">
                <dt className="font-medium">Note</dt>
                <dd>{row.note}</dd>
              </div>
            )}
          </dl>
        </li>
      ))}
    </ul>
  );
  const mechanismSoluteColor = ion => ({
    'Na+': '#2563eb',
    'K+': '#059669',
    'Cl-': '#7c3aed',
    'H+': '#dc2626',
    'HCO3-': '#0891b2',
    'Ca2+': '#ea580c',
    Phosphate: '#ca8a04',
    Glucose: '#db2777',
    AA: '#16a34a',
    Peptide: '#0d9488',
    'OA-': '#9333ea',
    'OC+': '#be123c',
    H2O: '#0284c7'
  }[ion] || '#475569');
  const mechanismStrokeWidth = value => {
    const magnitude = Math.abs(Number(value || 0));
    if (magnitude < 0.15) return 1.8;
    if (magnitude < 0.5) return 2.6;
    return 3.5;
  };
  const mechanismMembraneY = {
    apical: { outside: 78, cell: 158 },
    basolateral: { outside: 352, cell: 270 }
  };
  const mechanismSlotKey = (placement, transporterId) => placement + '-' + transporterId;
  const mechanismChipLabel = (name, maxChars = 10) => {
    if (!name) return '';
    if (name.length <= maxChars) return name;
    return name.slice(0, Math.max(3, maxChars - 3)) + '...';
  };
  const mechanismDisplaySoluteLabel = solute => {
    const compactLabels = {
      Glucose: 'Gluc',
      Peptide: 'Pept',
      Phosphate: 'PO4',
      'HCO3-': 'HCO3'
    };
    if (compactLabels[solute]) return compactLabels[solute];
    if (!solute) return '';
    return String(solute).replace(/\d*[+-]+$/, '') || String(solute);
  };
  const mechanismLabelWidth = label => Math.max(20, label.length * 6 + 8);
  const mechanismLabelBoxesOverlap = (a, b) => !(
    a.right + 3 < b.left ||
    a.left - 3 > b.right ||
    a.bottom + 2 < b.top ||
    a.top - 2 > b.bottom
  );
  const mechanismLabelCandidates = placement => {
    if (placement === 'apical') return [0, -5, -10, -15, 5, 10];
    if (placement === 'basolateral') return [0, 5, 10, 15, -5, -10];
    return [0, -5, 5, -10, 10];
  };
  const mechanismSteps = (() => {
    if (!result) return [];
    const steps = [];
    (result.fluxEvents || []).forEach(event => {
      if (event.id === SUPPORT_PUMP_ID || event.placement === 'none') return;
      (event.solutes || []).forEach(solute => {
        let value = Number(solute.flux || 0);
        if (event.id === 'ROMK' && solute.ion === 'K+') {
          const displayFlux = event.placement === 'apical'
            ? Number(result.displayApicalFlux?.['K+'] || 0)
            : Number(result.displayBasolateralFlux?.['K+'] || 0);
          if (
            Math.sign(displayFlux) === Math.sign(value) &&
            Math.abs(displayFlux) > Math.abs(value)
          ) {
            value = displayFlux;
          }
        }
        if (Math.abs(value) < 0.05) return;
        steps.push({
          id: event.id + '-' + event.placement + '-' + solute.ion + '-' + steps.length,
          pathway: 'transporter',
          role: event.type === 'passive' ? 'membrane pathway' : 'coupled/active step',
          placement: event.placement,
          transporterId: event.id,
          transporter: event.name,
          solute: solute.ion,
          value
        });
      });
    });
    const pumpGraphFlux = result.pumpSupportReport?.graphFlux || {};
    ['apical', 'basolateral'].forEach(placement => {
      ['Na+', 'K+'].forEach(ion => {
        const value = Number(pumpGraphFlux[placement]?.[ion] || 0);
        if (Math.abs(value) < 0.05) return;
        steps.push({
          id: 'nak-' + placement + '-' + ion,
          pathway: 'pump',
          role: 'Na⁺/K⁺ pump support',
          placement,
          transporterId: SUPPORT_PUMP_ID,
          transporter: 'Na⁺/K⁺-ATPase',
          solute: ion,
          value
        });
      });
    });
    const waterReportForMechanism = result.waterReport || {};
    const transcellularWater = Number(waterReportForMechanism.transcellular?.value || 0);
    if (Math.abs(transcellularWater) >= WATER_EPSILON) {
      steps.push({
        id: 'water-transcellular-apical',
        pathway: 'water',
        role: 'transcellular water pathway',
        placement: 'apical',
        transporterId: 'AQP',
        transporter: 'AQP',
        solute: 'H2O',
        value: transcellularWater
      });
      steps.push({
        id: 'water-transcellular-basolateral',
        pathway: 'water',
        role: 'transcellular water pathway',
        placement: 'basolateral',
        transporterId: 'AQP',
        transporter: 'AQP',
        solute: 'H2O',
        value: -transcellularWater
      });
    }
    const paracellularWater = Number(waterReportForMechanism.paracellular?.value || 0);
    if (Math.abs(paracellularWater) >= WATER_EPSILON) {
      steps.push({
        id: 'water-paracellular',
        pathway: 'paracellular',
        role: 'paracellular water pathway',
        placement: 'paracellular',
        transporterId: 'paracellular',
        transporter: 'Cation + Water Pore',
        solute: 'H2O',
        value: paracellularWater
      });
    }
    Object.entries(result.paraFlux || {}).forEach(([ion, value]) => {
      if (Math.abs(Number(value || 0)) < 0.05) return;
      steps.push({
        id: 'para-' + ion,
        pathway: 'paracellular',
        role: 'paracellular pathway',
        placement: 'paracellular',
        transporterId: 'paracellular',
        transporter: paracellularType === 'cation' ? 'Cation + Water Pore' : 'Anion Pore',
        solute: ion,
        value: Number(value || 0)
      });
    });
    return steps;
  })();
  const mechanismTransporterSlots = placement => {
    const placed = membraneTransporters(placement);
    const minX = 215;
    const maxX = 678;
    const y = placement === 'apical' ? 120 : 294;
    if (!placed.length) return [];
    const step = placed.length > 1 ? (maxX - minX) / (placed.length - 1) : 0;
    return placed.map((transporter, index) => {
      const centerX = placed.length > 1 ? minX + index * step : (minX + maxX) / 2;
      const maxWidth = placed.length > 1 ? Math.max(38, Math.min(76, step - 10)) : 82;
      const label = mechanismChipLabel(transporter.name, maxWidth < 52 ? 6 : 10);
      const width = Math.min(maxWidth, Math.max(38, label.length * 5.8 + 14));
      const x = centerX - width / 2;
      return {
        key: transporter.uid || transporter.id + '-' + placement,
        transporterId: transporter.id,
        placement,
        name: label,
        fullName: transporter.name,
        x,
        y,
        width,
        height: 24,
        centerX,
        arrowBaseX: Math.min(x + width + 10, maxX + 26)
      };
    });
  };
  const mechanismFallbackSlot = placement => ({
    transporterId: 'fallback',
    placement,
    x: 430,
    y: placement === 'apical' ? 120 : 294,
    width: 54,
    height: 24,
    centerX: 457,
    arrowBaseX: 472
  });
  const mechanismLayout = (() => {
    const apicalChips = mechanismTransporterSlots('apical');
    const basolateralChips = mechanismTransporterSlots('basolateral');
    const allChips = [...apicalChips, ...basolateralChips];
    const slotsByKey = Object.fromEntries(allChips.map(chip => [
      mechanismSlotKey(chip.placement, chip.transporterId),
      chip
    ]));
    const membraneSteps = mechanismSteps.filter(step => step.placement !== 'paracellular');
    const groupedSteps = membraneSteps.reduce((groups, step) => {
      const key = mechanismSlotKey(step.placement, step.transporterId || step.transporter);
      if (!groups[key]) groups[key] = [];
      groups[key].push(step);
      return groups;
    }, {});
    const arrows = [];
    Object.entries(groupedSteps).forEach(([key, steps]) => {
      steps.forEach((step, index) => {
        const slot = slotsByKey[key] || mechanismFallbackSlot(step.placement);
        const y = mechanismMembraneY[step.placement] || mechanismMembraneY.apical;
        const offset = (index - (steps.length - 1) / 2) * 12;
        const x = slot.centerX + offset;
        const intoCell = step.value > 0;
        arrows.push({
          ...step,
          arrowId: step.id,
          x1: x,
          y1: intoCell ? y.outside : y.cell,
          x2: x,
          y2: intoCell ? y.cell : y.outside,
          labelX: x,
          labelY: step.placement === 'apical' ? y.outside - 5 : y.outside + 15,
          cellX: x,
          cellY: y.cell,
          labelText: mechanismDisplaySoluteLabel(step.solute),
          cellDirection: intoCell ? 'in' : 'out'
        });
      });
    });

    const paracellularSteps = mechanismSteps.filter(step => step.placement === 'paracellular');
    const paracellularGap = paracellularSteps.length > 5 ? 9 : 13;
    const paracellularCenterX = 770;
    const paracellularBaseX = paracellularCenterX - ((paracellularSteps.length - 1) * paracellularGap) / 2;
    paracellularSteps.forEach((step, index) => {
      const towardBlood = step.value > 0;
      const x = paracellularBaseX + index * paracellularGap;
      arrows.push({
        ...step,
        arrowId: step.id,
        x1: x,
        y1: towardBlood ? 86 : 344,
        x2: x,
        y2: towardBlood ? 344 : 86,
        labelX: x,
        labelY: towardBlood ? 355 : 78,
        cellX: null,
        cellY: null,
        labelText: mechanismDisplaySoluteLabel(step.solute),
        cellDirection: null
      });
    });

    const arrowsWithLabels = arrows.map(arrow => ({ ...arrow }));
    ['apical', 'basolateral', 'paracellular'].forEach(lane => {
      const laneArrows = arrowsWithLabels
        .filter(arrow => (lane === 'paracellular' ? arrow.placement === 'paracellular' : arrow.placement === lane))
        .sort((a, b) => a.labelX - b.labelX || a.arrowId.localeCompare(b.arrowId));
      const occupiedBoxes = [];
      laneArrows.forEach(arrow => {
        const width = mechanismLabelWidth(arrow.labelText);
        const candidates = mechanismLabelCandidates(arrow.placement);
        const baseY = arrow.labelY;
        let chosenY = baseY;
        let chosenBox = null;
        let fallbackBox = null;
        candidates.some(delta => {
          const candidateY = baseY + delta;
          const candidateBox = {
            left: arrow.labelX - width / 2,
            right: arrow.labelX + width / 2,
            top: candidateY - 9,
            bottom: candidateY + 3
          };
          if (!occupiedBoxes.some(box => mechanismLabelBoxesOverlap(box, candidateBox))) {
            chosenY = candidateY;
            chosenBox = candidateBox;
            return true;
          }
          if (!fallbackBox) fallbackBox = candidateBox;
          return false;
        });
        arrow.labelY = chosenY;
        occupiedBoxes.push(chosenBox || fallbackBox || {
          left: arrow.labelX - width / 2,
          right: arrow.labelX + width / 2,
          top: chosenY - 9,
          bottom: chosenY + 3
        });
      });
    });

    const connectors = [];
    const membraneArrowsBySolute = arrowsWithLabels
      .filter(arrow => arrow.placement !== 'paracellular' && arrow.cellX != null)
      .reduce((groups, arrow) => {
        if (!groups[arrow.solute]) groups[arrow.solute] = [];
        groups[arrow.solute].push(arrow);
        return groups;
      }, {});
    Object.entries(membraneArrowsBySolute).forEach(([solute, soluteArrows]) => {
      const inward = soluteArrows.filter(arrow => arrow.cellDirection === 'in');
      const outward = soluteArrows.filter(arrow => arrow.cellDirection === 'out');
      const usedInward = new Set();
      const usedOutward = new Set();

      const addConnector = (inArrow, outArrow, kind) => {
        if (!outArrow) return;
        usedInward.add(inArrow.arrowId);
        usedOutward.add(outArrow.arrowId);
        const sameMembrane = inArrow.placement === outArrow.placement;
        const midY = sameMembrane
          ? (inArrow.placement === 'apical' ? inArrow.cellY + 48 : inArrow.cellY - 48)
          : (inArrow.cellY + outArrow.cellY) / 2;
        connectors.push({
          id: 'connector-' + kind + '-' + inArrow.arrowId + '-' + outArrow.arrowId,
          solute,
          kind,
          d: 'M ' + inArrow.cellX + ' ' + inArrow.cellY +
            ' C ' + inArrow.cellX + ' ' + midY + ', ' + outArrow.cellX + ' ' + midY + ', ' + outArrow.cellX + ' ' + outArrow.cellY
        });
      };

      if (inward.length > 1 && outward.length === 1) {
        inward.forEach(inArrow => addConnector(inArrow, outward[0], 'transcellular'));
        return;
      }
      if (outward.length > 1 && inward.length === 1) {
        outward.forEach(outArrow => addConnector(inward[0], outArrow, 'transcellular'));
        return;
      }

      inward.forEach(inArrow => {
        const candidates = outward
          .filter(outArrow => outArrow.placement !== inArrow.placement && !usedOutward.has(outArrow.arrowId))
          .sort((a, b) => Math.abs(a.cellX - inArrow.cellX) - Math.abs(b.cellX - inArrow.cellX));
        addConnector(inArrow, candidates[0], 'transcellular');
      });

      inward
        .filter(inArrow => !usedInward.has(inArrow.arrowId))
        .forEach(inArrow => {
          const candidates = outward
            .filter(outArrow => outArrow.placement === inArrow.placement && !usedOutward.has(outArrow.arrowId))
            .sort((a, b) => Math.abs(a.cellX - inArrow.cellX) - Math.abs(b.cellX - inArrow.cellX));
          addConnector(inArrow, candidates[0], 'recycling');
      });
    });

    return { apicalChips, basolateralChips, arrows: arrowsWithLabels, connectors };
  })();
  const mechanismDirectionText = step => {
    if (step.pathway === 'paracellular') {
      return step.value > 0 ? displayOrientation.positiveFluxLabel : displayOrientation.negativeFluxLabel;
    }
    if (step.placement === 'apical') {
      return step.value > 0
        ? displayOrientation.apicalShortLabel + ' side to cell'
        : 'cell to ' + displayOrientation.apicalShortLabel.toLowerCase() + ' side';
    }
    return step.value > 0
      ? displayOrientation.basolateralShortLabel + ' side to cell'
      : 'cell to ' + displayOrientation.basolateralShortLabel.toLowerCase() + ' side';
  };
  const MechanismDiagram = () => {
    const { apicalChips, basolateralChips, arrows, connectors } = mechanismLayout;
    const hasPump = transporters.some(t => t.id === SUPPORT_PUMP_ID && t.placement !== 'none');
    return (
      <section className="border rounded p-3 bg-white" aria-labelledby="mechanism-diagram-title">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
          <h3 id="mechanism-diagram-title" className="font-semibold">Mechanism Diagram</h3>
          <div className="text-xs text-gray-600">Qualitative pathway view</div>
        </div>
        <div className="overflow-x-auto">
          <svg viewBox="0 0 900 430" role="img" aria-label="Epithelial mechanism diagram showing transporter placement and solute pathway arrows." className="min-w-[760px] w-full h-auto">
            <defs>
              <marker id="mechanism-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
              </marker>
            </defs>
            <rect x="180" y="24" width="540" height="75" rx="6" fill="#eff6ff" stroke="#bfdbfe" />
            <rect x="180" y="116" width="540" height="196" rx="8" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="2" />
            <rect x="180" y="333" width="540" height="76" rx="6" fill="#ecfdf5" stroke="#bbf7d0" />
            <rect x="732" y="116" width="92" height="196" rx="8" fill="#fff7ed" stroke="#fdba74" strokeDasharray="4 3" />
            <text x="450" y="40" textAnchor="middle" fontSize="15" fontWeight="700" fill="#1e40af">{displayOrientation.apicalLabel}</text>
            <text x="450" y="214" textAnchor="middle" fontSize="15" fontWeight="700" fill="#334155">Cell interior</text>
            <text x="450" y="399" textAnchor="middle" fontSize="15" fontWeight="700" fill="#047857">{displayOrientation.basolateralLabel}</text>
            <text x="812" y="214" textAnchor="middle" fontSize="12" fontWeight="700" fill="#9a3412" transform="rotate(90 812 214)">Paracellular</text>
            {connectors.map(connector => (
              <path
                key={connector.id}
                d={connector.d}
                fill="none"
                stroke={mechanismSoluteColor(connector.solute)}
                strokeWidth={connector.kind === 'recycling' ? '1.8' : '1.6'}
                strokeDasharray={connector.kind === 'recycling' ? '3 4' : '6 5'}
                strokeLinecap="round"
                opacity={connector.kind === 'recycling' ? '0.5' : '0.42'}
              />
            ))}
            {apicalChips.map(chip => (
              <g
                key={chip.key}
                tabIndex={0}
                role="button"
                aria-label={chip.fullName || chip.name}
                onMouseEnter={event => showTransporterTooltip(event, 'mechanism-tooltip-' + chip.key, chip.fullName || chip.name)}
                onMouseLeave={hideTransporterTooltip}
                onFocus={event => showTransporterTooltip(event, 'mechanism-tooltip-' + chip.key, chip.fullName || chip.name)}
                onBlur={hideTransporterTooltip}
              >
                <rect x={chip.x} y={chip.y - 10} width={chip.width} height="24" rx="4" fill="#dbeafe" stroke="#2563eb" />
              </g>
            ))}
            {basolateralChips.map(chip => (
              <g
                key={chip.key}
                tabIndex={0}
                role="button"
                aria-label={chip.fullName || chip.name}
                onMouseEnter={event => showTransporterTooltip(event, 'mechanism-tooltip-' + chip.key, chip.fullName || chip.name)}
                onMouseLeave={hideTransporterTooltip}
                onFocus={event => showTransporterTooltip(event, 'mechanism-tooltip-' + chip.key, chip.fullName || chip.name)}
                onBlur={hideTransporterTooltip}
              >
                <rect x={chip.x} y={chip.y} width={chip.width} height="24" rx="4" fill="#dcfce7" stroke="#059669" />
              </g>
            ))}
            {arrows.map(step => {
              const color = mechanismSoluteColor(step.solute);
              return (
                <line
                  key={step.arrowId}
                  x1={step.placement === 'apical' ? step.x1 : step.x1}
                  y1={step.placement === 'apical' ? step.y1 : step.y1}
                  x2={step.placement === 'apical' ? step.x2 : step.x2}
                  y2={step.placement === 'apical' ? step.y2 : step.y2}
                  stroke={color}
                  strokeWidth={mechanismStrokeWidth(step.value)}
                  strokeDasharray={step.pathway === 'pump' ? '5 4' : step.pathway === 'paracellular' ? '3 3' : step.pathway === 'water' ? '2 3' : undefined}
                  markerEnd="url(#mechanism-arrow)"
                  opacity="0.88"
                />
              );
            })}
            {arrows.map(step => {
              const color = mechanismSoluteColor(step.solute);
              return (
                <text
                  key={step.arrowId + '-label'}
                  x={step.labelX}
                  y={step.placement === 'apical' ? step.labelY : step.labelY}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="700"
                  fill={color}
                  stroke="#ffffff"
                  strokeWidth="3"
                  paintOrder="stroke"
                >
                  {step.labelText || mechanismDisplaySoluteLabel(step.solute)}
                </text>
              );
            })}
            {apicalChips.map(chip => (
              <text
                key={chip.key + '-label'}
                x={chip.x + chip.width / 2}
                y={chip.y + 6}
                textAnchor="middle"
                fontSize="10"
                fill="#1e3a8a"
                stroke="#ffffff"
                strokeWidth="2.5"
                paintOrder="stroke"
                pointerEvents="none"
              >
                {chip.name}
              </text>
            ))}
            {basolateralChips.map(chip => (
              <text
                key={chip.key + '-label'}
                x={chip.x + chip.width / 2}
                y={chip.y + 16}
                textAnchor="middle"
                fontSize="10"
                fill="#064e3b"
                stroke="#ffffff"
                strokeWidth="2.5"
                paintOrder="stroke"
                pointerEvents="none"
              >
                {chip.name}
              </text>
            ))}
            {!mechanismSteps.length && (
              <text x="450" y="234" textAnchor="middle" fontSize="13" fill="#64748b">
                No active pathway arrows for this layout.
              </text>
            )}
          </svg>
        </div>
        <div className="mt-2 text-xs text-gray-600">
          {hasPump && !mechanismSteps.some(step => step.pathway === 'pump')
            ? 'Na⁺/K⁺-ATPase is present and establishes Na⁺/K⁺ gradients, but no pump-supported Na⁺ or K⁺ pathway is active in this layout.'
            : 'Arrows show local transporter steps, pump-supported Na⁺/K⁺ steps, water movement, and paracellular movement when active.'}
        </div>
        <AccessibleTable
          caption="Mechanism steps. Arrows are qualitative and are not scaled as quantitative rates."
          captionClassName="text-left text-xs font-normal text-gray-600 mt-3 mb-2"
          columns={[
            { key: 'solute', label: 'Solute' },
            { key: 'transporter', label: 'Pathway' },
            { key: 'direction', label: 'Direction' },
            { key: 'role', label: 'Role' },
            { key: 'value', label: 'Model value', format: formatTableValue }
          ]}
          rows={mechanismSteps.length
            ? mechanismSteps.map(step => ({
              ...step,
              solute: ION_LABEL[step.solute] || step.solute,
              direction: mechanismDirectionText(step)
            }))
            : [{
              solute: 'None',
              transporter: hasPump ? 'Na⁺/K⁺-ATPase gradient state' : 'None',
              direction: hasPump ? 'No paired Na⁺ entry or K⁺ exit pathway' : 'No active pathway',
              role: hasPump ? 'gradient support only' : 'none',
              value: 0
            }]}
        />
      </section>
    );
  };

  const AccessibleTable = ({ caption, captionClassName = 'text-left font-semibold mb-2', columns, rows }) => (
    <table className="min-w-full table-auto text-left text-sm border">
      <caption className={captionClassName}>{caption}</caption>
      <thead>
        <tr className="bg-gray-100">
          {columns.map(column => (
            <th key={column.key} scope="col" className="px-2 py-1 border">{column.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={[row.pathway, row.membrane, row.ion || row.label, index].filter(Boolean).join('-')} className="border-t">
            {columns.map((column, columnIndex) => (
              columnIndex === 0
                ? <th key={column.key} scope="row" className="px-2 py-1 border font-semibold">{row[column.key]}</th>
                : <td key={column.key} className="px-2 py-1 border">{column.format ? column.format(row[column.key], row) : row[column.key]}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
  
  // --- Render ---

  return (
<>
  {activeTransporterTooltip && (
    <div
      id={activeTransporterTooltip.id}
      role="tooltip"
      className="fixed z-50 rounded border bg-white p-2 text-xs text-gray-700 shadow-lg"
      style={{
        left: activeTransporterTooltip.left,
        top: activeTransporterTooltip.top,
        width: activeTransporterTooltip.width
      }}
      onMouseEnter={keepTransporterTooltipOpen}
      onMouseLeave={hideTransporterTooltip}
    >
      {activeTransporterTooltip.description}
    </div>
  )}
  {/* About Modal */}
  {showAbout && (
  <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50" onClick={() => setShowAbout(false)}>
    <div className="bg-white rounded-lg p-6 max-w-2xl shadow-lg overflow-y-auto max-h-[80vh] relative" onClick={e => e.stopPropagation()}>
      <Button size="sm" variant="outline" className="absolute top-3 right-3" aria-label="Close About window" onClick={() => setShowAbout(false)}>Close</Button>
      <h2 className="text-2xl font-bold mb-4 pr-20">About the Secretion and Absorption Learning Tool</h2>
      <div className="mb-3 text-sm text-gray-700">
  Developed by David Julian &middot; <a href="mailto:djulian@ufl.edu" className="underline text-blue-600">djulian@ufl.edu</a>
      </div>
      <h3 className="text-lg font-semibold mt-4 mb-1">Model Scope</h3>
      <ul className="list-disc ml-6 mb-3 text-sm">
        <li><b>Audience:</b> This About panel is written for instructors and reviewers. A later student-facing version can use less implementation detail.</li>
        <li><b>Purpose:</b> SALT is a qualitative teaching model for exploring epithelial pathway logic: which membrane steps are present, which are missing, and what consequences follow.</li>
        <li><b>Units:</b> Fluxes, concentration shifts, water tendencies, and charge tendencies use arbitrary teaching units. The model is not intended to produce research-grade flux magnitudes.</li>
        <li><b>Core distinction:</b> The app separates one-membrane flux tendencies from completed transepithelial flux. A transporter can move solute into or out of the cell even when a full apical-to-basolateral pathway is incomplete.</li>
        <li><b>Reservoirs and surfaces:</b> Bulk ECF bath concentrations are fixed by default and editable within physiological teaching ranges in Settings. ICF is model-derived from the steady-state cell condition. Local surface concentrations are calculated from transporter flux plus partial mixing, so local gradients can differ from the bulk reservoirs.</li>
        <li><b>Direction convention:</b> Flux graphs use one shared convention: positive points toward the basolateral/blood side and negative points toward the apical/lumen side.</li>
        <li><b>Placenta context:</b> Placenta uses maternal/fetal side labels; positive flux is displayed as maternal-to-fetal transfer.</li>
        <li><b>Exploration:</b> Tissue choices filter which transporters are offered, but they do not remove transporters already placed. Unusual layouts are allowed so users can observe their consequences.</li>
      </ul>
      <h3 className="text-lg font-semibold mt-4 mb-1">Teaching Abstractions &amp; Limits</h3>
      <ul className="list-disc ml-6 mb-3 text-sm">
        <li><b>Electrochemical context:</b> SALT uses simplified electrochemical direction rules for selected charged pathways. These rules are qualitative and are applied only when they support the teaching model. Na⁺/K⁺-ATPase establishes the pump-supported Na⁺/K⁺ gradient state and the associated implicit cell-negative context.</li>
        <li><b>Membrane potential limits:</b> SALT does not dynamically calculate membrane potential from transporter activity. Transporter fluxes do not feed back to alter membrane potential. Transepithelial potential remains a separate epithelial-scale tendency and may influence charged paracellular flux, but it is not used to calculate apical or basolateral membrane potential.</li>
        <li><b>Charge and polarity:</b> Charge outputs are teaching tendencies computed from modeled ion fluxes. They are intended to flag likely electrical consequences, not to solve a steady-state electrical circuit.</li>
        <li><b>Water:</b> H₂O is represented as solute-linked epithelial water movement tendency. The app does not calculate true cell volume or quantitative osmolality-driven water flux.</li>
        <li><b>pH:</b> H⁺ is not plotted with bulk solutes. Acid/base behavior is shown as pH tendency and net acid/base flux rather than as a buffered quantitative pH calculation.</li>
        <li><b>Flux-only cargo:</b> Amino acids, peptides, organic anions, and organic cations are shown in flux outputs only. They are excluded from concentration graphs, Settings concentration controls, and charge/polarity calculations.</li>
        <li><b>Class-level transporters:</b> AQP, GLUT, SGLT, NaPi 2:1, NaPi 3:1, Pi Facilitator, NBC, NKCC, TRPV5/6, CBE, OAT, OCT, MATE, MRP/BCRP, and PepT represent transporter classes. Isoform-specific regulation is simplified unless it is central to the teaching rule.</li>
        <li><b>Organic ion transport:</b> Organic ion transport is simplified in SALT. OAT represents tertiary-active organic anion uptake used in secretion pathways. In real proximal tubule cells, OAT exchange is supported indirectly by the Na⁺ gradient and intracellular dicarboxylates, but SALT does not model those exchanged solutes. Therefore, OAT requires Na⁺/K⁺-ATPase support in the model. MRP/BCRP represents simplified organic anion efflux, while OCT and MATE provide a simplified organic cation secretion pathway.</li>
        <li><b>Special teaching rules:</b> Na⁺/K⁺-ATPase establishes steady-state Na⁺ and K⁺ gradients when present. Pump density limits how much Na⁺ extrusion or K⁺ loading it can support. The Mechanism view shows Na⁺ extrusion and K⁺ loading arrows when any modeled Na⁺ entry or K⁺ exit pathway gives the pump a pathway to cycle; pump-only layouts establish gradients without showing Na⁺ or K⁺ flux arrows. A fully balanced pump-supported Na⁺ absorption layout also needs a K⁺ exit or recycling pathway; otherwise K⁺ loading is reported as an intracellular accumulation tendency. A pump-supported K⁺ secretion layout also needs Na⁺ entry; otherwise Na⁺ extrusion is reported as an intracellular depletion tendency. Apical Kir-mediated K⁺ recycling can add a lumen-positive TEP tendency when paired with apical K⁺ loading. NaPi 2:1 and NaPi 3:1 pair with Pi Facilitator on the opposite membrane for completed phosphate transport and preserve their Na⁺:Pi stoichiometry in completed epithelial flux. CFTR is represented as a regulated anion pathway with a smaller HCO₃⁻ tendency. TRPV5/6 uses a reduced teaching conductance so Ca²⁺ absorption remains smaller than bulk NaCl transport; dynamic inhibition by intracellular Ca²⁺ is not modeled.</li>
      </ul>
      {tissueLimitationRows.length > 0 && (
        <>
          <h3 className="text-lg font-semibold mt-4 mb-1">Tissue Preset Caveats</h3>
          <p className="text-sm mb-2">
            {TISSUE_LIMITATION_SYMBOL} in the Tissue selector marks presets whose core teaching pattern is useful but whose simplified output has a known tissue-specific limitation.
          </p>
          <ul className="list-disc ml-6 mb-3 text-sm">
            {tissueLimitationRows.map(row => (
              <li key={row.value}><b>{row.label}:</b> {row.note}</li>
            ))}
          </ul>
        </>
      )}
      <p className="text-sm mb-3">
        Airway surface epithelium, choroid plexus, and placenta presets are currently hidden from the selector because their expected physiology is too specialized for the current simplified teaching rules.
      </p>
      <h3 className="text-lg font-semibold mt-4 mb-1">General Flux Rules</h3>
      <ul className="list-disc ml-6 mb-3 text-sm">
        <li><b>Placement:</b> Transporters are active only when placed on the apical or basolateral membrane.</li>
        <li><b>Density:</b> Low, normal, and high density change transporter abundance and therefore scale the modeled flux tendency.</li>
        <li><b>Passive membrane pathways:</b> ENaC, Kir, ClC, CFTR, and TRPV5/6 use simplified electrochemical direction rules when Na⁺/K⁺-ATPase is present and primarily follow chemical concentration tendency when it is absent. GLUT remains non-voltage-sensitive and follows the glucose gradient.</li>
        <li><b>Coupled transport and exchangers:</b> Na⁺-coupled cotransporters and exchangers remain governed primarily by pump-supported Na⁺ gradient logic, stoichiometric coupling, and pathway completion. Selected electrogenic coupled pathways receive only small bounded implicit-Vm support and are not allowed to reverse routine teaching layouts.</li>
        <li><b>Regulated or supported pathways:</b> CFTR is treated as a regulated anion pathway whose direction follows the simplified electrochemical rule. NBC, NCC, NKCC, NHE3, and CBE remain placement- and coupling-based teaching pathways rather than voltage-driven reversal mechanisms.</li>
        <li><b>Pathway completion:</b> Completed transepithelial flux requires compatible entry and exit steps on opposite membranes. One-sided movement can still create intracellular accumulation or depletion tendencies.</li>
        <li><b>Transport balance:</b> The Results Snapshot flags coupled transporter mismatch, intracellular accumulation/depletion tendencies, or qualitative acid/base cell tendencies. A warning means the layout may not represent a balanced steady-state pathway, so review the detailed results below.</li>
        <li><b>Paracellular flux:</b> Paracellular ion movement is shown separately from membrane steps and is included in net epithelial flux when a leaky pathway is enabled. Paracellular ion leaks use concentration gradients plus transepithelial electrical tendency; paracellular water movement requires the Cation + Water Pore and follows the solute-linked water rule.</li>
        <li><b>Editable concentrations:</b> Editable ECF concentrations are constrained to physiological teaching ranges so exploratory changes illustrate meaningful physiology without producing extreme nonphysiological flux behavior.</li>
        <li><b>NKCC and K⁺ recycling:</b> Kir channels can support K⁺ recycling in NKCC-heavy layouts, especially thick ascending limb-like layouts. ROMK is a Kir channel class member, but the generalized NKCC class is not hard-gated by Kir.</li>
      </ul>
      <h3 className="text-lg font-semibold mt-6 mb-1">Transporter Actions &amp; Rules</h3>
      <ul className="list-disc ml-6 text-sm space-y-2">
        <li>
          <b>CBE:</b> chloride-bicarbonate exchanger<br/>
          <i>Action:</i> Cl⁻/HCO₃⁻ exchanger; moves Cl⁻ and HCO₃⁻ in opposite directions.<br/>
          <i>Rule:</i> Represents chloride-bicarbonate exchanger activity. Biological examples include AE1/2, pendrin, DRA/SLC26A3, and SLC26A6/PAT-1. Can pair with an opposite-membrane proton extruder to support acid secretion/base absorption or the reverse, depending on placement. Voltage-driven reversal is not added in this teaching phase.
        </li>
        <li>
          <b>AA facilitator:</b> facilitated amino acid transporter class; representative examples include LAT/SLC7 family transporters<br/>
          <i>Action:</i> Facilitated neutral amino acid movement.<br/>
          <i>Rule:</i> Can provide amino acid exit or entry in a completed amino acid pathway with Na⁺-AA cotransport on the opposite membrane.
        </li>
        <li>
          <b>AQP:</b> aquaporin class; representative members include AQP2, AQP3, and AQP4<br/>
          <i>Action:</i> Water channel; enables rapid H₂O movement.<br/>
          <i>Rule:</i> Net transcellular H₂O flux requires AQP on both apical and basolateral membranes. When that complete pathway is present, water tendency follows the combined osmotic pull and is scaled by the combined apical/basolateral AQP density.
        </li>
        <li>
          <b>CFTR:</b> cystic fibrosis transmembrane conductance regulator<br/>
          <i>Action:</i> Regulated epithelial anion channel; moves Cl⁻ and a smaller HCO₃⁻ component according to the simplified electrochemical tendency in this teaching model.<br/>
          <i>Rule:</i> Can complete Cl⁻ movement in either direction when paired with a compatible opposite-membrane Cl⁻ pathway. Basolateral NKCC plus apical CFTR can support secretion; apical CFTR plus basolateral ClC can support sweat-duct-like Cl⁻ reabsorption. CFTR alone is not treated as a complete transepithelial mechanism. Dynamic gating and detailed bicarbonate selectivity are not modeled.
        </li>
        <li>
          <b>ClC:</b> CLC family voltage-gated chloride channel class; includes ClC-Kb<br/>
          <i>Action:</i> Chloride channel; passive Cl⁻ flux follows the simplified electrochemical tendency in this teaching model.<br/>
          <i>Rule:</i> Can provide a Cl⁻ exit or entry pathway, helping complete NaCl transport driven by NCC or NKCC when intracellular Cl⁻ loading supports exit. Voltage dependence is not modeled.
        </li>
        <li>
          <b>ENaC:</b> epithelial sodium channel<br/>
          <i>Action:</i> Sodium channel; passive Na⁺ flux follows chemical tendency and the fixed implicit membrane-potential tendency when pump support is present.<br/>
          <i>Rule:</i> Can provide Na⁺ entry when placed on a membrane. Completed transepithelial Na⁺ absorption is limited by available apical Na⁺ entry and Na⁺/K⁺-ATPase extrusion support.
        </li>
        <li>
          <b>GLUT:</b> glucose transporter class<br/>
          <i>Action:</i> Facilitated glucose transporter; passive glucose flux follows the glucose gradient.<br/>
          <i>Rule:</i> SGLT can raise modeled cell glucose enough to drive GLUT. If the adjacent bath glucose is higher than the displayed cell glucose, GLUT favors glucose entry instead of exit.
        </li>
        <li>
          <b>H⁺-ATPase:</b> proton ATPase<br/>
          <i>Action:</i> Proton pump; moves 1 H⁺ out per ATP.<br/>
          <i>Rule:</i> Contributes to local H⁺ flux and pH tendency; completed acid/base flux is modeled when paired with NBC on the opposite membrane.
        </li>
        <li>
          <b>H⁺/K⁺-ATPase:</b> proton-potassium ATPase<br/>
          <i>Action:</i> Proton-potassium pump; moves 1 H⁺ out and 1 K⁺ in per ATP.<br/>
          <i>Rule:</i> Can create K⁺ transepithelial flux in this teaching model. For acid/base flux, it is treated as a proton extruder that pairs with NBC on the opposite membrane.
        </li>
        <li>
          <b>Kir:</b> inward-rectifier potassium channel class<br/>
          <i>Action:</i> Potassium channel; passive K⁺ flux follows the simplified electrochemical tendency. ROMK is a member of the Kir ion channel class.<br/>
          <i>Rule:</i> Can provide K⁺ exit or entry on either membrane depending on K⁺ electrochemical tendency. With Na⁺/K⁺-ATPase present, completed apical K⁺ secretion is limited by available pump K⁺ loading support and Kir exit capacity.
        </li>
        <li>
          <b>MATE:</b> multidrug and toxin extrusion transporter class; representative members include MATE1 and MATE2-K<br/>
          <i>Action:</i> H⁺/organic cation exchange; exchanges 1 H⁺ and 1 organic cation in opposite directions.<br/>
          <i>Rule:</i> Can pair with OCT on the opposite membrane for organic cation transport.
        </li>
        <li>
          <b>MRP/BCRP:</b> multidrug resistance protein / breast cancer resistance protein efflux transporter class<br/>
          <i>Action:</i> Simplified organic anion efflux from cell to the adjacent extracellular side.<br/>
          <i>Rule:</i> Apical MRP/BCRP can pair with basolateral OAT uptake to support organic anion secretion into the lumen. Basolateral placement follows the same outward-efflux teaching rule without added advanced behavior.
        </li>
        <li>
          <b>NaPi 2:1:</b> sodium-phosphate cotransporter class; representative member NaPi-IIc<br/>
          <i>Action:</i> Electroneutral Na⁺-phosphate symporter; co-transports 2 Na⁺ with 1 phosphate.<br/>
          <i>Rule:</i> Requires Na⁺/K⁺-ATPase support and pairs with a Pi Facilitator on the opposite membrane for completed phosphate transport. Completed epithelial flux preserves the 2:1 Na⁺:Pi stoichiometry while unmatched movement can still report intracellular imbalance.
        </li>
        <li>
          <b>NaPi 3:1:</b> sodium-phosphate cotransporter class; representative members include NaPi-IIa and NaPi-IIb<br/>
          <i>Action:</i> Electrogenic Na⁺-phosphate symporter; co-transports 3 Na⁺ with 1 phosphate.<br/>
          <i>Rule:</i> Requires Na⁺/K⁺-ATPase support and pairs with a Pi Facilitator on the opposite membrane for completed phosphate transport. Completed epithelial flux preserves the 3:1 Na⁺:Pi stoichiometry while unmatched movement can still report intracellular imbalance.
        </li>
        <li>
          <b>Na⁺-AA:</b> sodium-amino acid cotransporter class; representative examples include neutral amino acid transport systems such as B⁰AT/SLC6 family transporters<br/>
          <i>Action:</i> Na⁺-coupled neutral amino acid movement; moves 1 Na⁺ and 1 amino acid together.<br/>
          <i>Rule:</i> Requires Na⁺/K⁺-ATPase support and pairs with an AA facilitator on the opposite membrane for completed amino acid transport.
        </li>
        <li>
          <b>NBC:</b> sodium-bicarbonate cotransporter class<br/>
          <i>Action:</i> Electrogenic Na⁺-bicarbonate cotransporter; moves 1 Na⁺ and 2 HCO₃⁻ together.<br/>
          <i>Rule:</i> Requires Na⁺/K⁺ ATPase present. NBCe1 is the representative electrogenic example in SALT. Basolateral NBC can support HCO₃⁻ loading in bicarbonate secretory layouts, including pairing with apical CBE or CFTR for HCO₃⁻ secretion. It can also pair with proton extruders for transepithelial acid/base flux. Routine voltage-driven reversal is not modeled.
        </li>
        <li>
          <b>NCC:</b> sodium-chloride cotransporter<br/>
          <i>Action:</i> Na⁺-Cl⁻ symporter; co-transports 1 Na⁺ and 1 Cl⁻ together.<br/>
          <i>Rule:</i> Requires Na⁺/K⁺ ATPase support and remains primarily governed by coordinated NaCl coupling. Cl⁻ transepithelial completion requires compatible NCC, NKCC, CFTR, or chloride channel pathways on opposite membranes; otherwise Cl⁻ imbalance can appear.
        </li>
        <li>
          <b>NCX1:</b> sodium-calcium exchanger 1<br/>
          <i>Action:</i> Na⁺-Ca²⁺ exchanger; exchanges 3 Na⁺ and 1 Ca²⁺ in opposite directions.<br/>
          <i>Rule:</i> Requires Na⁺/K⁺-ATPase support and a Ca²⁺ loading context, such as TRPV5/6 on the opposite membrane. It can complete Ca²⁺ absorption with apical TRPV5/6, but routine NCX1 reversal is not modeled.
        </li>
        <li>
          <b>NHE3:</b> sodium-hydrogen exchanger 3<br/>
          <i>Action:</i> Na⁺/H⁺ exchanger; exchanges 1 Na⁺ and 1 H⁺ in opposite directions.<br/>
          <i>Rule:</i> Requires Na⁺/K⁺ ATPase present; activity decreases at higher pH; paired with NBC for transepithelial HCO₃⁻ and H⁺ flux. The Na⁺ gradient and pH teaching rule remain primary.
        </li>
        <li>
          <b>NKCC:</b> sodium-potassium-chloride cotransporter class; representative members include NKCC1 and NKCC2<br/>
          <i>Action:</i> Na⁺-K⁺-2Cl⁻ symporter; co-transports 1 Na⁺, 1 K⁺, and 2 Cl⁻ together.<br/>
          <i>Rule:</i> Requires Na⁺/K⁺ ATPase support and is not treated as strongly voltage-driven. Basolateral NKCC plus apical CFTR can produce Cl⁻ secretion; apical NKCC plus basolateral Cl⁻ exit can produce absorptive patterns. Kir channels, including ROMK in TAL-like layouts, can support K⁺ recycling but are not a hard gate for this generalized class.
        </li>
        <li>
          <b>Na⁺/K⁺ ATPase:</b> sodium-potassium ATPase<br/>
          <i>Biological action:</i> Active pump; moves 3 Na⁺ out and 2 K⁺ in per ATP.<br/>
          <i>Rule:</i> In this teaching layer, it establishes steady-state low Na⁺ and high K⁺ cell gradients when present. Density limits how much Na⁺ extrusion or K⁺ loading support it can provide, but it does not create larger-than-normal gradients. The Mechanism view shows pump Na⁺ extrusion and K⁺ loading arrows when a modeled Na⁺ entry or K⁺ exit pathway lets the pump cycle; pump-only layouts show gradient support without net Na⁺ or K⁺ flux. Without a K⁺ exit or recycling pathway, pump-supported Na⁺ absorption reports intracellular K⁺ accumulation; without Na⁺ entry, pump-supported K⁺ secretion reports intracellular Na⁺ depletion.
        </li>
        <li>
          <b>OAT:</b> organic anion transporter class; representative members include OAT1 and OAT3<br/>
          <i>Action:</i> Tertiary-active organic anion uptake for secretion pathways.<br/>
          <i>Rule:</i> Requires Na⁺/K⁺-ATPase support and can pair with MRP/BCRP on the opposite membrane for completed organic anion transport. SALT does not model the exchanged dicarboxylate.
        </li>
        <li>
          <b>OCT:</b> organic cation transporter class; representative members include OCT1 and OCT2<br/>
          <i>Action:</i> Organic cation movement.<br/>
          <i>Rule:</i> Can pair with MATE on the opposite membrane for organic cation transport.
        </li>
        <li>
          <b>PepT:</b> peptide transporter class; representative members include PepT1 and PepT2<br/>
          <i>Action:</i> H⁺-coupled small peptide movement; moves 1 H⁺ and 1 small peptide together.<br/>
          <i>Rule:</i> Peptide-derived nutrient absorption can be completed by an AA facilitator on the opposite membrane, representing intracellular peptide hydrolysis in this teaching layer.
        </li>
        <li>
          <b>Pi Facilitator:</b> facilitated inorganic phosphate transporter class; this mechanism is not well characterized but may be XPR1<br/>
          <i>Action:</i> Facilitated inorganic phosphate movement.<br/>
          <i>Rule:</i> Can provide phosphate exit or entry in a completed phosphate pathway with NaPi 2:1 or NaPi 3:1 cotransport on the opposite membrane.
        </li>
        <li>
          <b>PMCA:</b> plasma membrane calcium ATPase<br/>
          <i>Action:</i> Ca²⁺ pump; moves 1 Ca²⁺ out per ATP.<br/>
          <i>Rule:</i> Can complete Ca²⁺ flux when paired with TRPV5/6 on the opposite membrane.
        </li>
        <li>
          <b>SGLT:</b> sodium-glucose cotransporter class; representative members include SGLT1 and SGLT2<br/>
          <i>Action:</i> Na⁺-glucose symporter; co-transports 1 Na⁺ and 1 glucose together.<br/>
          <i>Rule:</i> Requires Na⁺/K⁺ ATPase present; for net glucose flux, SGLT and GLUT must be on opposite membranes. Pump-supported Na⁺ gradient logic dominates; the implicit cell-negative context provides only small bounded support and does not create routine reversal.
        </li>
        <li>
          <b>TRPV5/6:</b> epithelial calcium channel class; representative members include renal TRPV5 and intestinal TRPV6<br/>
          <i>Action:</i> Passive Ca²⁺ channel; Ca²⁺ flux follows chemical tendency and the fixed implicit membrane-potential tendency when pump support is present.<br/>
          <i>Rule:</i> Completed epithelial Ca²⁺ movement requires TRPV5/6 on one membrane and PMCA or NCX1 on the opposite membrane; apical TRPV5/6 plus basolateral extrusion produces absorption. SALT does not model dynamic channel regulation by intracellular Ca²⁺, so unmatched entry is shown as an intracellular Ca²⁺ accumulation tendency.
        </li>
      </ul>
      <h3 className="text-lg font-semibold mt-4 mb-1">Paracellular Pathway Actions & Rules</h3>
      <ul className="list-disc ml-6 text-sm">
        <li><b>Barrier:</b> Modeled as no paracellular solute or water flux. This is a teaching simplification; real tight junctions vary in permeability and selectivity.</li>
        <li><b>Cation + Water Pore:</b> Enables Na⁺ and K⁺ flux down their transepithelial electrochemical tendency and provides the paracellular water pathway for osmotic-pull-linked H₂O movement.</li>
        <li><b>Anion Pore:</b> Enables Cl⁻ flux, with some HCO₃⁻ permeability, down the transepithelial electrochemical tendency.</li>
        <li>Paracellular ion flux magnitude depends on the permeability setting, the concentration gradient, and the transepithelial electrical tendency. Paracellular water movement follows the combined osmotic pull when the Cation + Water Pore is present.</li>
      </ul>

      <h3 className="text-lg font-semibold mt-4 mb-1">Water Movement Rules</h3>
      <ul className="list-disc ml-6 text-sm">
        <li>H₂O is not treated as a transported solute concentration. The app reports qualitative water movement tendencies instead of calculating true cell volume or osmolality.</li>
        <li>ECF concentration settings and apical/cell/basolateral osmolality differences do not directly drive water flux.</li>
        <li>Osmotic pull combines net epithelial solute movement with the optional background osmotic pull toward blood. The background setting affects water movement only and does not change solute concentrations.</li>
        <li>Water tendency follows the combined osmotic pull when a water pathway is present. A complete transcellular pathway requires AQP on both apical and basolateral membranes and is scaled by the combined apical/basolateral AQP density; the Cation + Water Pore provides a paracellular water pathway.</li>
        <li>Barrier and Anion Pore do not provide paracellular water flux in this teaching model.</li>
      </ul>

      <h3 className="text-lg font-semibold mt-4 mb-1">Acid/Base &amp; pH Rules</h3>
      <ul className="list-disc ml-6 text-sm">
        <li>H⁺ is excluded from the standard concentration graph because its physiological concentration is too small to share a useful visual scale with Na⁺, K⁺, Cl⁻, glucose, and other bulk solutes.</li>
        <li>The app does not recalculate buffered H⁺ concentration or true pH after transport. Instead, it reports qualitative pH tendencies for the apical surface, cell, and basolateral surface.</li>
        <li>Completed paired acid/base pathways can use an implicit CO₂ + H₂O source for intracellular H⁺ and HCO₃⁻. Carbonic anhydrase is treated as present and not limiting, and CO₂ diffusion is not separately modeled.</li>
        <li>Surface pH tendencies come from local H⁺ flux at that membrane: H⁺ added to a surface tends to lower local pH, while H⁺ removed from a surface tends to raise local pH.</li>
        <li>Cell pH tendency compares the modeled cellular H⁺ load with HCO₃⁻ movement. H⁺ loading tends to acidify the cell, while HCO₃⁻ loading tends to alkalinize it.</li>
        <li>The net acid/base dial is calculated from completed transepithelial H⁺ and HCO₃⁻ flux. H⁺ secretion and HCO₃⁻ absorption point toward acid secretion/base absorption; the opposite points toward base secretion/acid absorption.</li>
      </ul>

      <h3 className="text-lg font-semibold mt-4 mb-1">Transepithelial Solute Flux Rules</h3>
      <ul className="list-disc ml-6 text-sm">
        <li><b>Glucose:</b> SGLT on one membrane and GLUT on the opposite membrane, with Na⁺/K⁺ ATPase support present.</li>
        <li><b>Na⁺:</b> SGLT, NaPi 2:1, NaPi 3:1, ENaC, NCC, or NKCC can provide Na⁺ entry tendencies. Completed pump-supported Na⁺ absorption is limited by the smaller of apical Na⁺ entry capacity and Na⁺/K⁺-ATPase extrusion support capacity, and fully balanced Na⁺ absorption also needs K⁺ exit or recycling. The Mechanism view can trace pump cycling from Na⁺ entry on either membrane.</li>
        <li><b>K⁺:</b> H⁺/K⁺-ATPase can create modeled K⁺ transepithelial flux. Kir can provide passive K⁺ membrane flux; basolateral Kir can balance pump-derived K⁺ loading during Na⁺ absorption, while additional unbalanced K⁺-moving pathways can still create K⁺ accumulation or depletion tendencies. With Na⁺/K⁺-ATPase present, apical Kir secretion is limited by the smaller of apical K⁺ exit capacity and pump K⁺ loading support capacity.</li>
        <li><b>Cl⁻:</b> NKCC, NCC, ClC, CFTR, or CBE can provide Cl⁻ membrane movement. Completed Cl⁻ flux requires compatible movement on opposite membranes.</li>
        <li><b>Ca²⁺:</b> TRPV5/6 provides passive Ca²⁺ entry. Completed Ca²⁺ movement requires PMCA or NCX1 on the opposite membrane; otherwise intracellular Ca²⁺ imbalance is reported.</li>
        <li><b>Phosphate:</b> NaPi 2:1 or NaPi 3:1 on one membrane and Pi Facilitator on the opposite membrane, with Na⁺/K⁺-ATPase support present, produce completed phosphate transport with the selected Na⁺:Pi stoichiometry.</li>
        <li><b>Amino acids:</b> Na⁺-AA on one membrane and AA facilitator on the opposite membrane produce completed neutral amino acid transport.</li>
        <li><b>Peptides:</b> PepT on one membrane and AA facilitator on the opposite membrane produce completed peptide-derived nutrient transport in this teaching layer.</li>
        <li><b>Organic anions and cations:</b> Pump-supported OAT and MRP/BCRP on opposite membranes complete organic anion pathways. OCT and MATE on opposite membranes complete organic cation pathways.</li>
        <li><b>H⁺ and HCO₃⁻:</b> A proton extruder (NHE3, H⁺-ATPase, or H⁺/K⁺-ATPase) on one membrane and NBC or CBE on the opposite membrane can create paired acid/base flux. Basolateral NBC can also load HCO₃⁻ for apical CBE or CFTR-mediated HCO₃⁻ secretion. NHE3 and NBC require Na⁺/K⁺-ATPase support; CBE, CFTR, H⁺-ATPase, and H⁺/K⁺-ATPase do not require that support in this teaching rule.</li>
        <li><b>H₂O:</b> Net transcellular water movement requires AQP on both apical and basolateral membranes and is scaled by their combined density. Paracellular H₂O movement requires the Cation + Water Pore. When a water pathway is present, H₂O follows the combined osmotic pull in arbitrary teaching units.</li>
      </ul>
      <Button size="sm" variant="outline" onClick={() => setShowAbout(false)} className="mt-4">Close</Button>
    </div>
  </div>
)}

<div className="flex h-screen">
<div className="w-1/3 p-4 border-r overflow-auto">
  <div className="text-xl font-bold mb-4 tracking-tight text-blue-800">
    SALT: <span className="font-normal text-gray-700">Secretion &amp; Absorption Learning Tool</span>
  </div><div className="flex flex-wrap items-center gap-2 mb-4">
<Button variant="outline" onClick={() => setShowAbout(true)}>About</Button>
<a
  href="SALT_Lessons.html"
  target="_blank"
  rel="noopener noreferrer"
  className="rounded px-3 py-1 border border-gray-400 bg-white text-gray-900 no-underline"
  aria-label="Open SALT lessons in a new window"
>
  Lessons
</a>
<Button variant="outline" onClick={() => setShowSettings(true)}>Settings</Button>
<Button variant="outline" onClick={() => setShowResetConfirm(true)}>Reset</Button>
</div>

        <div className="mt-4">
  <h2 className="text-base font-semibold mb-2">Tissue</h2>
  <select
    value={tissueOption.value}
    onChange={handleTissuePresetChange}
    className="w-full border rounded p-1"
    aria-label="Tissue transporter set"
  >
    <option value={allTissueOption.value}>{tissueOptionDisplayLabel(allTissueOption)}</option>
    {groupedTissueOptions.map(group => (
      <optgroup key={group.group} label={group.group}>
        {group.options.map(option => (
          <option key={option.value} value={option.value}>{tissueOptionDisplayLabel(option)}</option>
        ))}
      </optgroup>
    ))}
  </select>
  {selectedTissueLimitation && (
    <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
      <div className="font-semibold">Known tissue-model limitation</div>
      <div>{selectedTissueLimitation}</div>
    </div>
  )}
  <div className="text-xs text-gray-500 mt-1">
    {instructorDemoMode
      ? 'Places the instructor demo layout for the selected tissue.'
      : 'Filters the add-transporter list; already-added transporters remain active.'}
  </div>
</div>

        <div className="mt-4">
  <h2 className="text-base font-semibold mb-2">Paracellular Pathway</h2>
  <table className="min-w-full table-auto text-left mb-2">
    <tbody>
      <tr>
        <td className="px-2 py-1">
         <select
           value={paracellularType}
           onChange={e => setParacellularType(e.target.value)}
           className="w-full border rounded p-1"
           aria-label="Paracellular pathway"
         >
  <option value="none">Barrier</option>
  <option value="cation">Cation + Water Pore</option>
  <option value="anion">Anion Pore</option>
</select>

        </td>
        <td className="px-2 py-1">
          <Button size="sm" variant="outline" onClick={() => setShowParaInfo(true)}>Info</Button>
        </td>
      </tr>
    </tbody>
  </table>
</div>

        <div className="mt-4 space-y-4">
          {renderMembraneBuilder('apical', displayOrientation.apicalLabel)}
          {renderMembraneBuilder('basolateral', displayOrientation.basolateralLabel)}
        </div>
{showParaInfo && (
  <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
    <div className="bg-white rounded-lg p-6 max-w-lg w-[92vw] shadow-lg overflow-y-auto max-h-[85vh]">
      <h2 className="text-xl font-bold mb-2">Paracellular Pathway Settings</h2>
      <div className="mb-4 text-sm text-gray-700">
        <p className="mb-2"><b>Paracellular pathway:</b> Movement of solutes and water between cells.</p>
        <ul className="list-disc ml-6 space-y-1">
          <li><b>Barrier:</b> No passive leak</li>
          <li><b>Cation + Water Pore:</b> Permeable to Na⁺, K⁺, and water</li>
          <li><b>Anion Pore:</b> Permeable to Cl⁻, with some HCO₃⁻ permeability.</li>
        </ul>
      </div>
      {paracellularType === 'cation' && (
        <>
          <div className="mb-2">
            <label className="block mt-2 text-sm">Cation + Water Pore permeability:</label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={paraCationPerm}
              onChange={e => setParaCationPerm(Number(e.target.value))}
              className="border rounded p-1 w-full"
            />
          </div>
        </>
      )}
      {paracellularType === 'anion' && (
        <>
          <div className="mb-2">
            <label className="block mt-2 text-sm">Anion Pore permeability:</label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={paraAnionPerm}
              onChange={e => setParaAnionPerm(Number(e.target.value))}
              className="border rounded p-1 w-full"
            />
          </div>
        </>
      )}
      <Button className="mt-2" onClick={() => setShowParaInfo(false)}>Close</Button>
    </div>
  </div>
)}
{showResetConfirm && (
  <div
    className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50"
    role="presentation"
    onClick={() => setShowResetConfirm(false)}
  >
    <div
      className="bg-white rounded-lg p-6 max-w-md w-[92vw] shadow-lg"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="reset-confirm-title"
      aria-describedby="reset-confirm-description"
      onClick={e => e.stopPropagation()}
    >
      <h2 id="reset-confirm-title" className="text-xl font-bold mb-2">Reset all settings?</h2>
      <p id="reset-confirm-description" className="text-sm text-gray-700 mb-4">
        This clears all transporters and restores mode, tissue, paracellular pathway, water movement, baseline concentrations, and results view defaults.
      </p>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => setShowResetConfirm(false)}>Cancel</Button>
        <Button size="sm" onClick={resetAllSettings}>Reset</Button>
      </div>
    </div>
  </div>
)}
{showSettings && (
  <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50" onClick={() => setShowSettings(false)}>
    <div className="bg-white rounded-lg p-6 max-w-3xl w-[92vw] shadow-lg overflow-y-auto max-h-[85vh] relative" onClick={e => e.stopPropagation()}>
      <Button size="sm" variant="outline" className="absolute top-3 right-3" aria-label="Close Settings window" onClick={() => setShowSettings(false)}>Close</Button>
      <h2 className="text-xl font-bold mb-4 pr-20">Model Settings</h2>
      {ENABLE_INSTRUCTOR_DEMO_MODE && (
        <fieldset className="mb-4 text-sm text-gray-700">
          <legend className="block mb-2 font-semibold">Mode</legend>
          <div className="inline-flex rounded border border-gray-300 bg-white p-0.5" aria-label="SALT mode">
            {APP_MODE_OPTIONS.map(option => {
              const selected = appMode === option.value;
              return (
                <label
                  key={option.value}
                  className={
                    'cursor-pointer rounded px-3 py-1 font-medium focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-1 ' +
                    (selected ? 'bg-blue-700 text-white' : 'text-gray-700 hover:bg-gray-100')
                  }
                >
                  <input
                    type="radio"
                    name="salt-mode"
                    value={option.value}
                    checked={selected}
                    onChange={handleAppModeChange}
                    className="sr-only"
                  />
                  {option.label}
                </label>
              );
            })}
          </div>
          <p className="text-gray-500 mt-2">
            Explore keeps the standard student-facing behavior. Instructor Demo replaces the current layout with the selected preset's transporter placements, paracellular pathway, and default osmotic pull.
          </p>
        </fieldset>
      )}
      <div className="mb-4 text-sm text-gray-700">
        <h3 className="block mb-2 font-semibold">Background Osmotic Pull</h3>
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-3 items-end">
          <div>
            <label htmlFor="background-osmotic-pull" className="sr-only">Background osmotic pull</label>
            <select
              id="background-osmotic-pull"
              value={backgroundOsmoticPullSetting}
              onChange={e => setBackgroundOsmoticPullSetting(e.target.value)}
              className="border rounded p-1 w-full"
              aria-describedby="background-osmotic-pull-help background-osmotic-pull-effective"
            >
              {BACKGROUND_OSMOTIC_PULL_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{orientText(option.label)}</option>
              ))}
            </select>
          </div>
          <div id="background-osmotic-pull-effective" className="text-gray-600">
            Effective: {orientText(effectiveBackgroundOsmoticPull.status)}
          </div>
        </div>
        <p id="background-osmotic-pull-help" className="text-gray-500 mt-2">
          {orientText('Adds a background pull toward blood for water movement when a water pathway is present. This does not change solute concentrations.')}
        </p>
      </div>
      <div className="mb-4 text-sm text-gray-700">
        <div className="flex items-center justify-between gap-3 mb-2">
          <label className="font-semibold">Baseline Concentrations</label>
          <Button size="sm" variant="outline" onClick={resetBaseConcentrations}>
            Reset defaults
          </Button>
        </div>
        <p className="text-gray-500 mb-2">
          {displayOrientation.apicalShortLabel} and {displayOrientation.basolateralShortLabel} bulk ECF reservoirs are editable. ICF is determined by the modeled steady-state cell condition; Na⁺/K⁺-ATPase establishes steady-state Na⁺ and K⁺ gradients when present.
        </p>
        <p className="text-gray-500 mb-2">
          Pump density limits how much Na⁺ extrusion or K⁺ loading it can support. The Mechanism view shows pump Na⁺/K⁺ cycling arrows when Na⁺ entry or K⁺ exit pathways let the pump cycle; pump-only layouts establish gradients without Na⁺ or K⁺ flux arrows. Editable ECF concentrations are constrained to physiological teaching ranges.
        </p>
        <table className="min-w-full table-auto text-left border">
          <caption className="sr-only">Baseline concentration settings. {displayOrientation.apicalShortLabel} and {displayOrientation.basolateralShortLabel} ECF reservoirs are editable; cell ICF values are model-derived and not editable.</caption>
          <thead>
            <tr className="bg-gray-100">
              <th scope="col" className="px-2 py-1 border">Ion or solute</th>
              {settingsConcentrationCompartments.map(compartment => (
                <th key={compartment.key} scope="col" className="px-2 py-1 border">{compartment.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CONCENTRATION_EDIT_IONS.map(ion => (
              <tr key={ion}>
                <th scope="row" className="px-2 py-1 border font-semibold">{ION_LABEL[ion] || ion}</th>
                {settingsConcentrationCompartments.map(compartment => (
                  <td key={compartment.key} className="px-2 py-1 border">
                    {compartment.editable ? (
                      <>
                        <input
                          type="number"
                          min={ECF_CONCENTRATION_LIMITS[ion]?.min ?? 0}
                          max={ECF_CONCENTRATION_LIMITS[ion]?.max}
                          step={ion === 'Ca2+' ? '0.0001' : '0.1'}
                          value={baseConcentrations[compartment.key][ion]}
                          onChange={e => updateBaseConcentration(compartment.key, ion, e.target.value)}
                          className={
                            'border rounded p-1 w-full ' +
                            (concentrationValidationFor(compartment.key, ion)?.level === 'error'
                              ? 'border-red-500'
                              : concentrationValidationFor(compartment.key, ion)?.level === 'warning'
                                ? 'border-amber-500'
                                : '')
                          }
                          aria-label={(ION_LABEL[ion] || ion) + ' ' + compartment.label + ' reservoir concentration'}
                          aria-describedby={concentrationValidationFor(compartment.key, ion) ? 'concentration-validation-' + compartment.key + '-' + ion : undefined}
                        />
                        {concentrationValidationFor(compartment.key, ion) && (
                          <div
                            id={'concentration-validation-' + compartment.key + '-' + ion}
                            className={
                              'mt-1 text-xs ' +
                              (concentrationValidationFor(compartment.key, ion).level === 'error'
                                ? 'text-red-700'
                                : 'text-amber-700')
                            }
                          >
                            {concentrationValidationFor(compartment.key, ion).message}
                          </div>
                        )}
                      </>
                    ) : (
                      <span
                        className="block font-mono text-gray-700"
                        aria-label={(ION_LABEL[ion] || ion) + ' modeled cell ICF concentration, not editable'}
                      >
                        {formatSettingsConcentration(settingsConcentrations[compartment.key][ion])}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button size="sm" variant="outline" className="mt-4" onClick={() => setShowSettings(false)}>
        Close
      </Button>
    </div>
  </div>
)}

{showInfoModal && modalTransporter && (
  <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
    <div className="bg-white rounded-lg p-6 max-w-md shadow-lg">
      <h2 className="text-xl font-bold mb-2">{modalTransporter.name}</h2>
     <div className="mb-2 text-sm">
  <div>
    {(() => {
      switch (modalTransporter.id) {
        case 'AE1':
          return <><b>Chloride-bicarbonate exchanger (CBE)</b>: moves 1 Cl⁻ and 1 HCO₃⁻ in opposite directions. Biological examples include AE1/2, pendrin, DRA/SLC26A3, and SLC26A6/PAT-1. Behavior remains placement- and coupling-based rather than voltage-driven.<br/></>;
        case 'AAFacilitator':
          return <><b>AA facilitator</b>: generic facilitated neutral amino acid transporter; representative examples include LAT/SLC7 family transporters.<br/></>;
        case 'PiFacilitator':
          return <><b>Pi Facilitator</b>: generic facilitated inorganic phosphate transporter. This mechanism is not well characterized but may be XPR1.<br/></>;
        case 'AQP':
          return <><b>AQP water channel class</b>: representative members include AQP2, AQP3, and AQP4; supports transcellular H₂O movement when apical and basolateral AQP form a complete pathway, scaled by their combined density.<br/></>;
        case 'CFTR':
          return <><b>CFTR regulated anion channel</b>: passive Cl⁻ and smaller HCO₃⁻ movement follow the simplified electrochemical tendency. CFTR can support Cl⁻ secretion or reabsorption when paired with a compatible opposite-membrane Cl⁻ pathway, but it is not treated as an ATP-driven Cl⁻ pump. SALT does not model CFTR gating, cAMP regulation, or detailed bicarbonate selectivity.<br/></>;
        case 'ClCKb':
          return <><b>ClC chloride channel family</b>: passive Cl⁻ movement follows the simplified electrochemical tendency in this teaching model. Includes ClC-Kb; voltage dependence is not modeled.<br/></>;
        case 'ENaC':
          return <><b>Epithelial sodium channel</b>: passive Na⁺ movement follows chemical tendency plus the fixed implicit membrane-potential tendency when pump support is present.<br/></>;
        case 'GLUT2':
          return <><b>GLUT glucose transporter class</b>: passive glucose flux follows the glucose gradient. GLUT1 and GLUT2 are representative examples.<br/></>;
        case 'TRPV56':
          return <><b>TRPV5/6 epithelial calcium channel class</b>: passive Ca²⁺ entry follows chemical tendency plus the fixed implicit membrane-potential tendency when pump support is present, with reduced teaching conductance so Ca²⁺ flux stays smaller than bulk NaCl movement. SALT does not model dynamic inhibition by intracellular Ca²⁺; unmatched entry is shown as intracellular Ca²⁺ accumulation tendency.<br/></>;
        case 'HATPase':
          return <><b>Proton-ATPase (V-type)</b>: moves 1 H⁺ out per ATP.<br/></>;
        case 'HKATPase':
          return <><b>Proton-potassium ATPase</b>: moves 1 H⁺ out and 1 K⁺ in per ATP.<br/></>;
        case 'MATE':
          return <><b>MATE transporter class</b>: representative members include MATE1 and MATE2-K; exchanges 1 H⁺ and 1 organic cation in opposite directions.<br/></>;
        case 'MRPBCRP':
          return <><b>MRP/BCRP efflux transporter class</b>: moves organic anions out of the cell toward the adjacent extracellular side. Apical placement can support OA⁻ secretion after basolateral OAT uptake.<br/></>;
        case 'NaPi2':
          return <><b>NaPi 2:1 cotransporter class</b>: represents NaPi-IIc; moves 2 Na⁺ with 1 phosphate. This pathway is electroneutral in the teaching model.<br/></>;
        case 'NaPi':
          return <><b>NaPi 3:1 cotransporter class</b>: represents NaPi-IIa/IIb; moves 3 Na⁺ with 1 phosphate. This pathway is electrogenic and receives small bounded implicit electrical support when pump support is present.<br/></>;
        case 'NaAA':
          return <><b>Na⁺-AA cotransporter</b>: generic Na⁺-coupled neutral amino acid transporter; moves 1 Na⁺ and 1 neutral amino acid together.<br/></>;
        case 'NBCe1':
          return <><b>NBC sodium-bicarbonate cotransporter class</b>: moves 1 Na⁺ and 2 HCO₃⁻ together in pump-supported bicarbonate loading layouts. NBCe1 is the representative electrogenic example in SALT; NBC can pair with apical CBE or CFTR for HCO₃⁻ secretion. Routine voltage-driven reversal is not modeled.<br/></>;
        case 'NCC':
          return <><b>Sodium-chloride cotransporter</b>: moves 1 Na⁺ and 1 Cl⁻ together by pump-supported NaCl coupling; not treated as strongly voltage-driven.<br/></>;
        case 'NCX1':
          return <><b>Sodium-calcium exchanger</b>: exchanges 3 Na⁺ and 1 Ca²⁺ in opposite directions. In SALT, Ca²⁺ extrusion requires pump support and a Ca²⁺ loading context such as opposite-membrane TRPV5/6.<br/></>;
        case 'NHE3':
          return <><b>Sodium-hydrogen exchanger 3</b>: exchanges 1 Na⁺ and 1 H⁺ in opposite directions using pump-supported Na⁺ gradient and existing pH teaching logic.<br/></>;
        case 'NKCC':
          return <><b>NKCC cotransporter class</b>: representative members include NKCC1 and NKCC2; moves 1 Na⁺, 1 K⁺, and 2 Cl⁻ together using pump-supported coupled transport logic.<br/></>;
        case 'NaKATPase':
          return <><b>Sodium-potassium pump</b>: moves 3 Na⁺ out and 2 K⁺ in per ATP. Density limits supported Na⁺ extrusion or K⁺ loading. In the Mechanism view, pump Na⁺ and K⁺ arrows appear when a Na⁺ entry or K⁺ exit pathway lets the pump cycle; pump-only layouts establish gradients without standalone Na⁺ or K⁺ flux. Unmatched K⁺ loading reports K⁺ accumulation, and unmatched Na⁺ extrusion reports Na⁺ depletion.<br/></>;
        case 'OAT':
          return <><b>OAT transporter class</b>: representative members include OAT1 and OAT3; tertiary-active OA⁻ uptake for secretion pathways. Requires Na⁺/K⁺-ATPase support; SALT does not model the exchanged dicarboxylate.<br/></>;
        case 'OCT':
          return <><b>OCT transporter class</b>: representative members include OCT1 and OCT2; facilitated OC⁺ movement.<br/></>;
        case 'PMCA':
          return <><b>Plasma membrane calcium ATPase</b>: moves 1 Ca²⁺ out per ATP.<br/></>;
        case 'PepT':
          return <><b>PepT transporter class</b>: representative members include PepT1 and PepT2; moves 1 H⁺ and 1 small peptide together.<br/></>;
        case 'Pendrin':
          return <><b>Chloride-bicarbonate exchanger (CBE)</b>: exchanges Cl⁻ and HCO₃⁻ in opposite directions. Biological examples include AE1/2, pendrin, DRA/SLC26A3, and SLC26A6/PAT-1. Behavior remains placement- and coupling-based rather than voltage-driven.<br/></>;
        case 'ROMK':
          return <><b>Kir potassium channel class</b>: passive K⁺ movement follows the simplified electrochemical tendency. ROMK is a member of this inward-rectifier K⁺ channel class.<br/></>;
        case 'SGLT':
          return <><b>SGLT cotransporter class</b>: representative members include SGLT1 and SGLT2; moves 1 Na⁺ and 1 glucose together using pump-supported Na⁺ gradient logic with small bounded implicit electrical support.<br/></>;
        default:
          return null;
      }
    })()}
  </div>
  
  <div>
    <b>Stoichiometry:</b>{" "}
    {Object.entries(modalTransporter.stoich)
      .map(([ion, coeff]) => `${ion} ${coeff >= 0 ? "+" : ""}${coeff}`)
      .join(", ")}
  </div>
</div>

      <Button className="mt-2" onClick={() => setShowInfoModal(false)}>Close</Button>
    </div>
  </div>
)
}

      </div>
      <div className="flex-1 p-4 flex flex-col">
       
 {result && (
          <div className="mt-3 space-y-4 overflow-auto">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold">Results</h2>
              <fieldset className="inline-flex items-center rounded border border-gray-300 bg-white p-0.5 text-xs" aria-label="Results view">
                <legend className="sr-only">Results view</legend>
                {[
                  { value: 'mechanism', label: 'Mechanism' },
                  { value: 'graphs', label: 'Graphs' },
                  { value: 'tables', label: 'Tables' }
                ].map(option => {
                  const selected = resultsView === option.value;
                  return (
                    <label
                      key={option.value}
                      className={
                        'cursor-pointer rounded px-2 py-1 font-medium focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-1 ' +
                        (selected ? 'bg-blue-700 text-white' : 'text-gray-700 hover:bg-gray-100')
                      }
                    >
                      <input
                        type="radio"
                        name="results-view"
                        value={option.value}
                        checked={selected}
                        onChange={() => setResultsView(option.value)}
                        className="sr-only"
                      />
                      {option.label}
                    </label>
                  );
                })}
              </fieldset>
            </div>
            <section className="border rounded p-3 bg-white" aria-labelledby="results-snapshot-title">
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                <h2 id="results-snapshot-title" className="font-semibold">Results Snapshot</h2>
                <div className="text-xs text-gray-600">Interpreted model outputs</div>
              </div>
              <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 items-stretch" aria-label="Results Snapshot output tiles">
                {resultsSnapshotTiles.map(tile => <SnapshotTile key={tile.key} tile={tile} />)}
              </ul>
              <div className="mt-2 text-xs text-gray-600">
                Detailed flux, concentration, and balance views appear below.
              </div>
            </section>

            {resultsView === 'mechanism' ? (
              <div className="space-y-4">
                <MechanismDiagram />
              </div>
            ) : resultsView === 'graphs' ? (
              <div className="space-y-4">
                <section className="border rounded p-3 bg-white">
                  <h3 className="font-semibold">Membrane and Epithelial Fluxes</h3>
                  <div className="text-xs text-gray-600 mb-2">{fluxDirectionCaption}</div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mb-3" aria-label="Shared flux graph legend">
                    {fluxBarSeries.map(series => (
                      <div key={series.key} className="inline-flex items-center gap-1">
                        <span
                          className="inline-block h-3 w-3 rounded-sm"
                          style={{ backgroundColor: series.color }}
                          aria-hidden="true"
                        />
                        <span>{series.name}</span>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-4">
                    {visibleIonDirectionalFluxGroups.map(group => (
                      <div key={group.key} className="pt-3">
                        <h4 className="font-semibold text-sm mb-1">{group.label}</h4>
                        <ResponsiveContainer width="100%" height={180}>
                          <BarChart data={group.rows} margin={{ top: 5, right: 12, left: 0, bottom: 5 }}>
                            <XAxis dataKey="label" interval={0} tick={{ fontSize: 12 }} height={36} />
                            <YAxis tick={{ fontSize: 12 }} />
                            <ReferenceLine y={0} stroke="#000" strokeWidth={1} />
                            <Tooltip formatter={value => (value?.toFixed ? Number(value).toFixed(2) : value)} />
                            {fluxBarSeries.map(series => (
                              <Bar key={series.key} dataKey={series.key} name={series.name} fill={series.color} />
                            ))}
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ))}
                    {visibleSupplementalDirectionalFluxGroups.length > 0 && (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {visibleSupplementalDirectionalFluxGroups.map(group => (
                          <div key={group.key} className="pt-3">
                            <h4 className="font-semibold text-sm mb-1">{group.label}</h4>
                            <ResponsiveContainer width="100%" height={150}>
                              <BarChart data={group.rows} margin={{ top: 5, right: 12, left: 0, bottom: 5 }}>
                                <XAxis dataKey="label" interval={0} tick={{ fontSize: 12 }} height={36} />
                                <YAxis tick={{ fontSize: 12 }} />
                                <ReferenceLine y={0} stroke="#000" strokeWidth={1} />
                                <Tooltip formatter={value => (value?.toFixed ? Number(value).toFixed(2) : value)} />
                                {fluxBarSeries.map(series => (
                                  <Bar key={series.key} dataKey={series.key} name={series.name} fill={series.color} />
                                ))}
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
                <div>
                  <h3 className="font-semibold">Solute Concentrations</h3>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mb-2" aria-label="Concentration graph legend">
                    {concentrationCompartments.map(compartment => (
                      <div key={compartment.key} className="inline-flex items-center gap-1">
                        <span
                          className="inline-block h-3 w-3 rounded-sm"
                          style={{
                            backgroundColor: compartment.color,
                            opacity: compartment.fillOpacity ?? 1
                          }}
                          aria-hidden="true"
                        />
                        <span>{compartment.name}</span>
                      </div>
                    ))}
                  </div>
                  <div className="text-xs text-gray-600 mb-2">Click a solute group to open a zoomed concentration view. Concentrations are shown in mmol/L. Surface and ICF values are model-derived teaching estimates.</div>
                  <ResponsiveContainer width="100%" height={190}>
                    <BarChart data={concData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }} onClick={openConcentrationZoomFromChart}>
                      <XAxis dataKey="ion" interval={0} tick={{ fontSize: 12 }} height={36} />
                      <YAxis domain={[0,150]} tick={{ fontSize: 12 }} />
                      <Tooltip content={<ConcentrationTooltip />} wrapperStyle={{ pointerEvents: 'none' }} />
                      {concentrationCompartments.map(compartment => (
                        <Bar
                          key={compartment.key}
                          dataKey={compartment.key}
                          name={compartment.name}
                          fill={compartment.color}
                          fillOpacity={compartment.fillOpacity}
                          onClick={openConcentrationZoomFromChart}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                  {zoomedConcentrationRow && (
                    <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-40" onClick={() => setZoomedConcentrationIon(null)}>
                      <section className="bg-white rounded-lg p-4 shadow-lg w-[92vw] max-w-xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between gap-3 mb-2">
                          <h4 className="font-semibold">Concentration Zoom: {zoomedConcentrationRow.ion}</h4>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setZoomedConcentrationIon(null)}
                            aria-label="Close concentration zoom"
                          >
                            Close
                          </Button>
                        </div>
                        <div
                          role="img"
                          aria-label={'Zoomed concentration view for ' + zoomedConcentrationRow.ion + '.'}
                        >
                          <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={zoomedConcentrationData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                              <XAxis dataKey="compartment" interval={0} tick={<ConcentrationZoomAxisTick />} height={52} />
                              <YAxis
                                domain={[0, zoomedConcentrationDomainMax]}
                                tick={{ fontSize: 11 }}
                                tickFormatter={formatConcentrationAxisTick}
                              />
                              <Tooltip formatter={value => (value?.toFixed ? Number(value).toFixed(4) : value)} />
                              <Bar dataKey="concentration" name={zoomedConcentrationRow.ion + ' concentration'} fill="#2563eb" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </section>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-6 overflow-auto">
                <AccessibleTable
                  caption={'Membrane and Epithelial Fluxes. ' + fluxDirectionCaption}
                  columns={[
                    { key: 'ion', label: 'Ion or solute' },
                    { key: 'groupLabel', label: 'Flux group' },
                    { key: 'apicalStep', label: displayOrientation.apicalMembraneLabel, format: formatTableValue },
                    { key: 'basolateralStep', label: displayOrientation.basolateralMembraneLabel, format: formatTableValue },
                    { key: 'paracellularStep', label: 'Paracellular', format: formatTableValue },
                    { key: 'transepithelial', label: 'Net epithelial', format: formatTableValue },
                    { key: 'direction', label: 'Direction', format: (_, row) => fluxDirection(row.transepithelial) }
                  ]}
                  rows={directionalFluxRows.map(row => ({ ...row, ion: row.label, direction: fluxDirection(row.transepithelial) }))}
                />
                <AccessibleTable
                  caption="Solute Concentrations. Concentrations are shown in mmol/L. Surface and ICF values are model-derived teaching estimates."
                  columns={[
                    { key: 'ion', label: 'Ion or solute' },
                    { key: 'apicalBulk', label: concentrationCompartments.find(compartment => compartment.key === 'apicalBulk')?.label || 'Apical Bulk ECF', format: formatTableValue },
                    { key: 'apicalSurface', label: concentrationCompartments.find(compartment => compartment.key === 'apicalSurface')?.label || 'Apical Surface ECF', format: formatTableValue },
                    { key: 'icf', label: 'ICF', format: formatTableValue },
                    { key: 'basolateralSurface', label: concentrationCompartments.find(compartment => compartment.key === 'basolateralSurface')?.label || 'Basolateral Surface ECF', format: formatTableValue },
                    { key: 'basolateralBulk', label: concentrationCompartments.find(compartment => compartment.key === 'basolateralBulk')?.label || 'Basolateral Bulk ECF', format: formatTableValue }
                  ]}
                  rows={concTableData}
                />
              </div>
            )}

            {chargeReport && (
              <div>
                <div className="mb-3">
                <h3 className="font-semibold mb-2">Intracellular Balance</h3>
                  <AccessibleTable
                    caption="Intracellular accumulation or depletion tendencies compared with the modeled starting cell condition."
                    captionClassName="text-left text-xs font-normal text-gray-600 mb-2"
                    columns={[
                      { key: 'label', label: 'Ion or solute' },
                      { key: 'direction', label: 'Tendency' },
                      { key: 'change', label: 'Modeled change', format: formatTableValue }
                    ]}
                    rows={cellImbalanceRows}
                  />
                </div>
                <h3 className="font-semibold mb-2">Charge &amp; Polarity</h3>
                <AccessibleTable
                  caption="Charge and polarity tendencies in arbitrary teaching units."
                  captionClassName="text-left text-xs font-normal text-gray-600 mb-2"
                  columns={[
                    { key: 'label', label: 'Region' },
                    { key: 'direction', label: 'Tendency' },
                    { key: 'strength', label: 'Strength' },
                    { key: 'value', label: 'Value', format: value => formatChargeValue(value) + ' charge units' }
                  ]}
                  rows={[
                    { ...chargeReport.apical, label: displayOrientation.apicalMembraneLabel },
                    { ...chargeReport.basolateral, label: displayOrientation.basolateralMembraneLabel },
                    chargeReport.cell,
                    { ...chargeReport.transepithelial, direction: orientText(chargeReport.transepithelial.direction) }
                  ]}
                />
                <h3 className="font-semibold mb-2 mt-4">Electrochemical Context</h3>
                <AccessibleTable
                  caption="Selected membrane channels use a fixed implicit membrane-potential tendency when pump support is present. TEP is not used for transmembrane tendency; paracellular ion leaks use TEP qualitatively."
                  captionClassName="text-left text-xs font-normal text-gray-600 mb-2"
                  columns={[
                    { key: 'pathway', label: 'Pathway' },
                    { key: 'ion', label: 'Ion' },
                    { key: 'chemical', label: 'Chemical tendency' },
                    { key: 'electrical', label: 'Electrical tendency' },
                    { key: 'net', label: 'Net electrochemical tendency', format: value => <span className="font-semibold">{value}</span> },
                    { key: 'interpretation', label: 'Interpretation' }
                  ]}
                  rows={electrochemicalTableRows}
                />
              </div>
            )}

            {acidBaseReport && (
              <div>
                <h3 className="font-semibold mb-2">Acid/Base &amp; pH</h3>
                {(resultsView === 'graphs' || resultsView === 'mechanism') && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm mb-3">
                    <div className="border rounded p-3">
                      <div className="font-semibold">{displayOrientation.apicalShortLabel} surface</div>
                      <div>{acidBaseReport.apicalSurface}</div>
                    </div>
                    <div className="border rounded p-3">
                      <div className="font-semibold">Cell</div>
                      <div>{acidBaseReport.cell}</div>
                      {acidBaseReport.cellNote && (
                        <div className="text-gray-500">{acidBaseReport.cellNote}</div>
                      )}
                    </div>
                    <div className="border rounded p-3">
                      <div className="font-semibold">{displayOrientation.basolateralShortLabel} surface</div>
                      <div>{acidBaseReport.basolateralSurface}</div>
                    </div>
                  </div>
                )}
                {resultsView === 'tables' && (
                  <AccessibleTable
                    caption="Acid/base tendencies. H+ concentration is not graphed with bulk solutes and buffered pH is not recalculated."
                    columns={[
                      { key: 'region', label: 'Region' },
                      { key: 'tendency', label: 'pH or acid/base tendency' },
                      { key: 'note', label: 'Note' }
                    ]}
                    rows={[
                      { region: 'Net epithelium', tendency: orientText(acidBaseReport.transepithelial.direction), note: acidBaseReport.transepithelial.strength + '; ' + formatChargeValue(acidBaseReport.transepithelial.value) + ' acid/base units' },
                      { region: displayOrientation.apicalShortLabel + ' surface', tendency: acidBaseReport.apicalSurface, note: 'Based on local H+ flux tendency' },
                      { region: 'Cell', tendency: acidBaseReport.cell, note: acidBaseReport.cellNote || '' },
                      { region: displayOrientation.basolateralShortLabel + ' surface', tendency: acidBaseReport.basolateralSurface, note: 'Based on local H+ flux tendency' }
                    ]}
                  />
                )}
              </div>
            )}

            {waterReport && (
              <div>
                <h3 className="font-semibold mb-2">Water Movement</h3>
                <WaterDetailCards rows={waterDetailRows} />
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  <div className="absolute bottom-1 left-0 w-full text-center text-xs text-gray-400 pb-1">
    &copy; {new Date().getFullYear()} David Julian. All rights reserved.
  </div>
</>
  );
}
