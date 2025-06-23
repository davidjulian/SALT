import React, { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
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

function osmolality(comp) {
  // Sums all major solute concentrations except water, in arbitrary units.
  // This can be adjusted for biological accuracy (exclude H2O, scale appropriately).
  return Object.entries(comp)
    .filter(([ion]) => ion !== 'H2O')
    .reduce((sum, [ion, conc]) => sum + Math.abs(conc), 0);
}

const INITIAL_TRANSPORTERS = [
  { id: 'AQP2',     name: 'AQP2',       type: 'channel',    stoich: { 'H2O': 1 },            kinetics: { maxRate: 1.0, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'AQP3',     name: 'AQP3',       type: 'channel',    stoich: { 'H2O': 1 },            kinetics: { maxRate: 1.0, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'ENaC',     name: 'ENaC',       type: 'channel',    stoich: { 'Na+': 1 },            kinetics: { maxRate: 1.0, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'GLUT2',    name: 'GLUT2',      type: 'channel',    stoich: { 'Glucose': -1 },      kinetics: { maxRate: 1.0, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'HATPase',  name: 'H⁺-ATPase',  type: 'pump',       stoich: { 'H+': -1 },           kinetics: { maxRate: 0.9, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'HKATPase', name: 'H⁺/K⁺-ATPase', type: 'pump', stoich: { 'H+': -1, 'K+': 1 }, kinetics: { maxRate: 0.8, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'NBCe1',    name: 'NBCe1',      type: 'symporter',  stoich: { 'Na+': 1, 'HCO3-': 3 }, kinetics: { maxRate: 0.7, Km: 2.0 }, placement: 'none', density: 1 },
  { id: 'NCC',      name: 'NCC',        type: 'symporter',  stoich: { 'Na+': 1, 'Cl-': 1 },  kinetics: { maxRate: 0.6, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'NCX1',     name: 'NCX1',       type: 'exchanger',  stoich: { 'Na+': 3, 'Ca2+': -1 }, kinetics: { maxRate: 0.4, Km: 0.2 }, placement: 'none', density: 1 },
  { id: 'NHE3',     name: 'NHE3',       type: 'antiporter', stoich: { 'Na+': 1, 'H+': -1 },  kinetics: { maxRate: 1.0, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'NKCC2',    name: 'NKCC2',      type: 'symporter',  stoich: { 'Na+': 1, 'K+': 1, 'Cl-': 2 }, kinetics: { maxRate: 0.5, Km: 0.5 }, placement: 'none', density: 1 },
  { id: 'NaKATPase',name: 'Na⁺/K⁺-ATPase',type: 'pump',       stoich: { 'Na+': -3, 'K+': 2 }, kinetics: { maxRate: 1.2, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'PMCA',     name: 'PMCA',       type: 'pump',       stoich: { 'Ca2+': -1 },         kinetics: { maxRate: 0.3, Km: 0.5 }, placement: 'none', density: 1 },
  { id: 'ROMK',     name: 'ROMK',       type: 'channel',    stoich: { 'K+': -1 },           kinetics: { maxRate: 0.5, Km: 1.0 }, placement: 'none', density: 1 },
  { id: 'SGLT2',    name: 'SGLT2',      type: 'symporter',  stoich: { 'Na+': 1, 'Glucose': 1 }, kinetics: { maxRate: 0.8, Km: 1.5 }, placement: 'none', density: 1 }
];

const INITIAL_CONCENTRATIONS = {
  apicalECF:     { 'Na+':145, 'K+':4,   'Cl-':105, 'H+':0.00004, 'HCO3-':24, 'Ca2+':1.2, 'Glucose':5,  'H2O':100 },
  icf:           { 'Na+':12,  'K+':140, 'Cl-':10,  'H+':0.00002, 'HCO3-':10, 'Ca2+':0.0001,'Glucose':1,  'H2O':100 },
  basolateralECF:{ 'Na+':145, 'K+':4,   'Cl-':105, 'H+':0.00004, 'HCO3-':24, 'Ca2+':1.2, 'Glucose':5,  'H2O':100 }
};

export default function App() {
  // State
  const [showAbout, setShowAbout] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [modalTransporterId, setModalTransporterId] = useState(null);
  const [transporters, setTransporters] = useState(INITIAL_TRANSPORTERS);
  const [result, setResult] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [waterModel, setWaterModel] = useState('simple'); // 'simple' or 'detailed'

  // ECF model state
const [ecfModel, setEcfModel] = useState('infinite'); // 'infinite' or 'finite'
const [ecfPoolSize, setEcfPoolSize] = useState(10); // unitless

  // Paracellular pathway state
  const [paracellularType, setParacellularType] = useState('none'); // 'none' | 'cation' | 'anion'
  const [paraCationPerm, setParaCationPerm] = useState(1.0); // default value
  const [paraAnionPerm, setParaAnionPerm] = useState(1.0);   // default value
  const [showParaInfo, setShowParaInfo] = useState(false);

  // --- Automatically run simulation on page load ---
  useEffect(() => {
  calculateFluxesAndConcs(transporters);
  // eslint-disable-next-line
}, [
  transporters,
  paracellularType,
  paraCationPerm,
  paraAnionPerm,
  ecfModel,
  ecfPoolSize
]);

  useEffect(() => {
  // If a water channel is now open and was previously closed, force a recalc
  if (
    transporters.some(t => (t.id === 'AQP2' || t.id === 'AQP3') && t.placement !== 'none')
    && result && result.transepiFluxData && !result.transepiFluxData.some(row => row.ion === 'H2O' && row.transepithelial !== 0)
  ) {
    calculateFluxesAndConcs(transporters);
  }
}, [transporters, result]);


  const updateTransporter = (id, field, value) => {
    setTransporters(ts =>
      ts.map(t =>
        t.id === id
          ? (field === 'kinetics'
              ? { ...t, kinetics: { ...value } }
              : { ...t, [field]: value })
          : t
      )
    );
  };


  // --- Simulation Logic ---

// Helper to get placements for a transporter in this simulation step
function placementsForTick(id, tList) {
  return tList.filter(t => t.id === id && t.placement !== 'none').map(t => t.placement);
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
          return Math.min(Math.abs(entryFlux), Math.abs(exitFlux));
        } else if (entryFlux < 0 && exitFlux > 0) {
          return -Math.min(Math.abs(entryFlux), Math.abs(exitFlux));
        }
      }
    }
  }
  return 0;
}

const calculateFluxesAndConcs = (tList = transporters) => {
  // Use current ECF concentrations (mutable if finite)
  let apicalECF, basolateralECF;
  if (ecfModel === 'infinite' || !result) {
    apicalECF = { ...INITIAL_CONCENTRATIONS.apicalECF };
    basolateralECF = { ...INITIAL_CONCENTRATIONS.basolateralECF };
  } else {
    apicalECF = { ...result.concentrations.apicalECF };
    basolateralECF = { ...result.concentrations.basolateralECF };
  }
  const apicalFlux = {};
  const basolateralFlux = {};
  Object.keys(INITIAL_CONCENTRATIONS.apicalECF).forEach(ion => { apicalFlux[ion] = 0; basolateralFlux[ion] = 0; });

  const hasNaKATPase = tList.some(t => t.id === 'NaKATPase' && t.placement !== 'none');

  // Calculate all apical and basolateral transmembrane fluxes
  tList.forEach(t => {
    if (t.id === 'NKCC2') {
      const romkSame = tList.some(u => u.id === 'ROMK' && u.placement === t.placement && t.placement !== 'none');
      if (!romkSame) return;
    }
    if (t.stoich['Na+'] && !hasNaKATPase) return;
    if (t.placement === 'none') return;

    let rate = (t.kinetics.maxRate / (t.kinetics.Km + 1)) * t.density;
    if (t.id === 'NHE3') {
      const h = (INITIAL_CONCENTRATIONS.icf['H+']);
      const pH = -Math.log10(h);
      const pH50 = 7.2;
      const sigma = 0.05;
      rate *= 1 / (1 + Math.exp((pH - pH50) / sigma));
    }
    Object.entries(t.stoich).forEach(([ion, coeff]) => {
      // Only allow water transmembrane flux if a water gradient exists!
      if (ion === 'H2O') {
        let gradient = 0;
        if (t.placement === 'apical') {
          gradient = (apicalECF['H2O'] ?? 0) - (INITIAL_CONCENTRATIONS.icf['H2O']);
        } else if (t.placement === 'basolateral') {
          gradient = (basolateralECF['H2O'] ?? 0) - (INITIAL_CONCENTRATIONS.icf['H2O']);
        }
        // Only produce a flux if there's a gradient
        if (Math.abs(gradient) < 1e-6) return;
        rate *= Math.sign(gradient);
      }
      const delta = rate * coeff;
      if (t.placement === 'apical') apicalFlux[ion] += delta;
      else basolateralFlux[ion] += delta;
    });
  });

  const netFlux = {};
  Object.keys(apicalFlux).forEach(ion => { netFlux[ion] = apicalFlux[ion] + basolateralFlux[ion]; });

  // --- Update ECF concentrations if "finite" model is selected ---
  if (ecfModel === 'finite') {
    Object.keys(apicalECF).forEach(ion => {
      apicalECF[ion] -= apicalFlux[ion] / ecfPoolSize;
      if (apicalECF[ion] < 0) apicalECF[ion] = 0;
    });
    Object.keys(basolateralECF).forEach(ion => {
      basolateralECF[ion] += basolateralFlux[ion] / ecfPoolSize;
      if (basolateralECF[ion] < 0) basolateralECF[ion] = 0;
    });
  }

  const newICF = { ...INITIAL_CONCENTRATIONS.icf };
  Object.entries(netFlux).forEach(([ion, flux]) => { newICF[ion] += flux; });
  newICF['H+'] = Math.max(newICF['H+'], 1e-8);

  // --- Paracellular Pathway Fluxes ---
  const paraFlux = {};
  Object.keys(INITIAL_CONCENTRATIONS.apicalECF).forEach(ion => { paraFlux[ion] = 0; });

  if (paracellularType === 'cation') {
    ['Na+','K+','H2O'].forEach(ion => {
      const cap = apicalECF[ion];
      const blp = basolateralECF[ion];
      paraFlux[ion] = paraCationPerm * (cap - blp);
    });
  }
  if (paracellularType === 'anion') {
    ['Cl-','HCO3-'].forEach(ion => {
      const cap = apicalECF[ion];
      const blp = basolateralECF[ion];
      paraFlux[ion] = paraAnionPerm * (cap - blp);
    });
  }
  Object.keys(netFlux).forEach(ion => { netFlux[ion] += paraFlux[ion] || 0; });

  // --- Transepithelial Fluxes using ONLY current tick values ---
  const glucoseTransEpiFlux = transepithelialFlux('Glucose', ['SGLT2'], ['GLUT2'], true, apicalFlux, basolateralFlux, tList, hasNaKATPase);
  const naTransEpiFlux = transepithelialFlux('Na+', ['SGLT2','ENaC','NCC','NKCC2'], ['NaKATPase'], true, apicalFlux, basolateralFlux, tList, hasNaKATPase);
  const clTransEpiFlux = transepithelialFlux('Cl-', ['NKCC2','NCC'], ['NKCC2','NCC'], false, apicalFlux, basolateralFlux, tList, hasNaKATPase);
  const caTransEpiFlux = transepithelialFlux('Ca2+', ['NCX1','PMCA'], ['NCX1','PMCA'], false, apicalFlux, basolateralFlux, tList, hasNaKATPase);

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
    kTransEpiFlux = transepithelialFlux('K+', ['NKCC2','ROMK'], ['ROMK','NaKATPase'], true, apicalFlux, basolateralFlux, hasNaKATPase);
  }

  // Transepithelial H+ and HCO3- logic (skipped here for brevity; add as above if desired)

  // Compose transepiFluxDataNoH2O
  const transepiFluxDataNoH2O = Object.keys(netFlux).filter(ion => ion !== 'H2O').map(ion => {
    switch (ion) {
      case 'Glucose': return { ion, transepithelial: glucoseTransEpiFlux };
      case 'Na+':     return { ion, transepithelial: naTransEpiFlux };
      case 'K+':      return { ion, transepithelial: kTransEpiFlux };
      case 'Cl-':     return { ion, transepithelial: clTransEpiFlux };
      case 'Ca2+':    return { ion, transepithelial: caTransEpiFlux };
      default:        return { ion, transepithelial: 0 };
    }
  });

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

  // Water pathway logic: detect if AQPs on opposite membranes
  const aqp2Sides = placementsForTick('AQP2', tList);
  const aqp3Sides = placementsForTick('AQP3', tList);
  let h2oPathway = false;
  for (let side2 of aqp2Sides) {
    for (let side3 of aqp3Sides) {
      if (side2 !== side3) h2oPathway = true;
    }
  }

  // Water flux calculation
  let h2oTransEpiFlux = 0;
const netTEFluxNum = transepiFluxDataNoH2O.reduce((sum, row) => sum + row.transepithelial, 0);

const isParaCationWaterPath = paracellularType === 'cation';

// Water follows solute for teaching: infinite ECF + simple water model + any pathway
if ((h2oPathway || isParaCationWaterPath) && ecfModel === 'infinite' && waterModel === 'simple') {
  h2oTransEpiFlux = 0.5 * Math.sign(netTEFluxNum) * Math.min(Math.abs(netTEFluxNum), 5);
}

// If finite/detailed, still allow paracellular H2O flux due to concentration difference
if (paracellularType === 'cation' && !(ecfModel === 'infinite' && waterModel === 'simple')) {
  h2oTransEpiFlux += paraFlux['H2O'] || 0;
}

  // Compose transepiFluxData for display
  const transepiFluxData = [
    ...transepiFluxDataNoH2O,
    { ion: 'H2O', transepithelial: h2oTransEpiFlux }
  ];

  // Assign "virtual" TM water fluxes for infinite/simple mode & pathway
  if (ecfModel === 'infinite' && waterModel === 'simple' && h2oPathway) {
    apicalFlux['H2O'] = h2oTransEpiFlux;
    basolateralFlux['H2O'] = -h2oTransEpiFlux;
  }

  // Water/osmolality modeling (as before)
  if (ecfModel === 'infinite') {
    newICF['H2O'] = basolateralECF['H2O'];
  }
  if (ecfModel === 'finite') {
    if (waterModel === 'simple') {
      const blOsm = osmolality(basolateralECF);
      const icfOsm = osmolality(newICF);
      if (blOsm !== icfOsm) {
        newICF['H2O'] += (blOsm - icfOsm);
        newICF['H2O'] = Math.max(newICF['H2O'], 0);
      }
    }
    // else: allow ICF and BL ECF osmolality to differ
  }

  // Push results
  setResult({
    apicalFlux,
    basolateralFlux,
    netFlux,
    concentrations: {
      apicalECF,
      icf: newICF,
      basolateralECF
    },
    paraFlux,
    transepiFluxData
  });
};


  // --- Derived Data for Display ---
  const icfH = result?.concentrations?.icf['H+'] ?? INITIAL_CONCENTRATIONS.icf['H+'];
  const icf_pH = -Math.log10(icfH);

  const fluxData = result
    ? Object.keys(result.netFlux).map(ion => ({
        ion,
        apical: result.apicalFlux[ion],
        basolateral: result.basolateralFlux[ion],
        net: result.netFlux[ion]
      }))
    : [];
  const concData = result
    ? Object.keys(result.concentrations.icf).map(ion => ({
        ion,
        apicalECF: result.concentrations.apicalECF[ion],
        icf: result.concentrations.icf[ion],
        basolateralECF: result.concentrations.basolateralECF[ion]
      }))
    : [];

  // Helper: get all placements for a transporter id (except 'none')
  const placementsFor = id => transporters.filter(t => t.id === id && t.placement !== 'none').map(t => t.placement);
  const hasNaKATPase = transporters.some(t => t.id === 'NaKATPase' && t.placement !== 'none');

  function transepithelialFlux(ion, entryIds, exitIds, requirePump = false) {
    if (requirePump && !hasNaKATPase) return 0;
    const entrySides = [].concat(...entryIds.map(id => placementsFor(id)));
    const exitSides = [].concat(...exitIds.map(id => placementsFor(id)));
    for (let side1 of entrySides) {
      for (let side2 of exitSides) {
        if (side1 !== side2) {
          const entryFlux = side1 === 'apical' ? (result?.apicalFlux[ion] ?? 0) : (result?.basolateralFlux[ion] ?? 0);
          const exitFlux  = side2 === 'apical' ? (result?.apicalFlux[ion] ?? 0) : (result?.basolateralFlux[ion] ?? 0);
          if (entryFlux > 0 && exitFlux < 0) {
            return Math.min(Math.abs(entryFlux), Math.abs(exitFlux));
          } else if (entryFlux < 0 && exitFlux > 0) {
            return -Math.min(Math.abs(entryFlux), Math.abs(exitFlux));
          }
        }
      }
    }
    return 0;
  }

  const glucoseTransEpiFlux = transepithelialFlux('Glucose', ['SGLT2'], ['GLUT2'], true);
  const naTransEpiFlux     = transepithelialFlux('Na+',    ['SGLT2','ENaC','NCC','NKCC2'], ['NaKATPase'], true);
  const clTransEpiFlux     = transepithelialFlux('Cl-',    ['NKCC2','NCC'], ['NKCC2','NCC']);
  const caTransEpiFlux     = transepithelialFlux('Ca2+',   ['NCX1','PMCA'], ['NCX1','PMCA']);

// For H⁺/K⁺-ATPase, K⁺ flux can occur with HKATPase on either membrane (no exit needed).
const hkAtpaseSides = placementsFor('HKATPase');
let kTransEpiFlux = 0;
if (hkAtpaseSides.length > 0 && result) {
  const apicalHK = transporters.some(t => t.id === 'HKATPase' && t.placement === 'apical');
  const basolateralHK = transporters.some(t => t.id === 'HKATPase' && t.placement === 'basolateral');
  if (apicalHK) kTransEpiFlux += result.apicalFlux['K+'] ?? 0;
  if (basolateralHK) kTransEpiFlux += result.basolateralFlux['K+'] ?? 0;
}
// Add other K+ pathways (NKCC2, ROMK) if present on opposite membranes as before:
if (kTransEpiFlux === 0) {
  kTransEpiFlux = transepithelialFlux('K+', ['NKCC2','ROMK'], ['ROMK','NaKATPase'], true);
}
  
// Parallel/mirrored H⁺ and HCO₃⁻ TE flux logic: require a proton extruder (NHE3, HATPase, HKATPase) on one membrane and NBCe1 on the opposite membrane (plus Na⁺/K⁺ ATPase for NHE3/NBCe1)
const hExtruders = transporters.filter(t => ['NHE3','HATPase','HKATPase'].includes(t.id) && t.placement !== 'none');
const nbcTrans = transporters.filter(t => t.id === 'NBCe1' && t.placement !== 'none');
const requirePump = hasNaKATPase;

let hTransEpiFlux = 0;
let hco3TransEpiFlux = 0;
if (requirePump && hExtruders.length > 0 && nbcTrans.length > 0) {
  // For every combination of H+ extruder and NBCe1 on opposite membranes
  let fluxPairs = [];
  for (let t of hExtruders) {
    for (let nbc of nbcTrans) {
      if (t.placement !== nbc.placement) {
        // Use max possible rate as the limiting step
        let extruderRate = (t.kinetics.maxRate / (t.kinetics.Km + 1)) * t.density;
        let nbcRate = (nbc.kinetics.maxRate / (nbc.kinetics.Km + 1)) * nbc.density * 3; // NBCe1 moves 3 HCO3-
        // Direction: If H+ extruder is apical, it's acid secretion; if basolateral, acid reabsorption
        let limiting = Math.min(Math.abs(extruderRate), Math.abs(nbcRate));
        if (t.placement === 'apical' && nbc.placement === 'basolateral') {
          // Acid secretion, base reabsorption
          fluxPairs.push({ h: -limiting, hco3: limiting });
        } else if (t.placement === 'basolateral' && nbc.placement === 'apical') {
          // Acid reabsorption, base secretion
          fluxPairs.push({ h: limiting, hco3: -limiting });
        }
      }
    }
  }
  // Sum (allowing for more than one pair), but only use the largest (for teaching clarity, usually only one pair will be present)
  if (fluxPairs.length > 0) {
    hTransEpiFlux = fluxPairs.reduce((sum, p) => sum + p.h, 0);
    hco3TransEpiFlux = fluxPairs.reduce((sum, p) => sum + p.hco3, 0);
  }
}

  const transepiFluxDataNoH2O = result
    ? Object.keys(result.netFlux).filter(ion => ion !== 'H2O').map(ion => {
        switch (ion) {
          case 'Glucose': return { ion, transepithelial: glucoseTransEpiFlux };
          case 'Na+':     return { ion, transepithelial: naTransEpiFlux };
          case 'K+':      return { ion, transepithelial: kTransEpiFlux };
          case 'Cl-':     return { ion, transepithelial: clTransEpiFlux };
          case 'Ca2+':    return { ion, transepithelial: caTransEpiFlux };
          case 'HCO3-':   return { ion, transepithelial: hco3TransEpiFlux };
          case 'H+':      return { ion, transepithelial: hTransEpiFlux };
          default:        return { ion, transepithelial: 0 };
        }
      })
    : [];

  // Inject paracellular fluxes into transepiFluxDataNoH2O
const paraFlux = result?.paraFlux || {};
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
  const aqp2Sides = placementsFor('AQP2');
  const aqp3Sides = placementsFor('AQP3');
  let h2oPathway = false;
  for (let side2 of aqp2Sides) {
    for (let side3 of aqp3Sides) {
      if (side2 !== side3) h2oPathway = true;
    }
  }

let h2oTransEpiFlux = 0;

if (h2oPathway && result) {
  const soluteTransEpiNet = transepiFluxDataNoH2O
    .reduce((sum, row) => sum + row.transepithelial, 0);

  // In infinite ECF/simple water mode, water "follows solute"
  if (ecfModel === 'infinite' && waterModel === 'simple') {
    // Link water TE flux to solute TE flux (isosmotic absorption)
    h2oTransEpiFlux = 0.5 * Math.sign(soluteTransEpiNet) * Math.min(Math.abs(soluteTransEpiNet), 5);
  } else {
    // In finite/detailed mode, only allow if actual driving force exists
    h2oTransEpiFlux = 0;
  }
}

// Paracellular water flux, add if enabled
if (paracellularType === 'cation') {
  h2oTransEpiFlux += paraFlux['H2O'] || 0;
}
  
  const transepiFluxData = [
    ...transepiFluxDataNoH2O,
    { ion: 'H2O', transepithelial: h2oTransEpiFlux }
  ];

  const netTEFluxNum =
  transepiFluxData
    .filter(row => row.ion !== 'H2O')
    .reduce((sum, row) => sum + row.transepithelial, 0);
  
const modalTransporter = transporters.find(t => t.id === modalTransporterId);
const netTEFlux =
  transepiFluxData
    .filter(row => row.ion !== 'H2O')
    .reduce((sum, row) => sum + row.transepithelial, 0)
    .toFixed(3);
  
  // --- Render ---

  return (
<>
  {/* About Modal */}
  {showAbout && (
  <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
    <div className="bg-white rounded-lg p-6 max-w-2xl shadow-lg overflow-y-auto max-h-[80vh]">
      <h2 className="text-2xl font-bold mb-4">About the Secretion and Absorption Learning Tool</h2>
      <div className="mb-3 text-sm text-gray-700">
  Developed by David Julian &middot; <a href="mailto:djulian@ufl.edu" className="underline text-blue-600">djulian@ufl.edu</a>
      </div>
      <h3 className="text-lg font-semibold mt-4 mb-1">General Transmembrane Flux Rules</h3>
      <ul className="list-disc ml-6 mb-3 text-sm">
        <li>Transporters are only active if placed on the apical or basolateral membrane.</li>
        <li>Na⁺-coupled transporters (SGLT2, ENaC, NCC, NKCC2, NHE3, NBCe1, etc.) require Na⁺/K⁺ ATPase (on any membrane) to be present.</li>
      </ul>
      <h3 className="text-lg font-semibold mt-6 mb-1">Transporter Actions & Rules</h3>
      <ul className="list-disc ml-6 text-sm space-y-2">
        <li>
          <b>AQP2:</b> Water channel; enables rapid H₂O movement.<br/>
          <i>Rule:</i> Both AQP2 and AQP3 must be present on opposite membranes for net transepithelial H₂O flux.
        </li>
        <li>
          <b>AQP3:</b> Water channel; enables rapid H₂O movement.<br/>
          <i>Rule:</i> Both AQP2 and AQP3 must be present on opposite membranes for net transepithelial H₂O flux.
        </li>
        <li>
          <b>ENaC:</b> Sodium channel; allows passive Na⁺ entry.<br/>
          <i>Rule:</i> Requires Na⁺/K⁺ ATPase somewhere to be active and to contribute to net Na⁺ flux.
        </li>
        <li>
          <b>GLUT2:</b> Facilitated glucose transporter; allows glucose to exit the cell.<br/>
          <i>Rule:</i> Net glucose transport requires SGLT2 on one membrane and GLUT2 on the opposite, and Na⁺/K⁺ ATPase present.
        </li>
        <li>
          <b>H⁺-ATPase:</b> Proton pump; pumps H⁺ out using ATP.<br/>
          <i>Rule:</i> Contributes to H⁺ efflux, can participate in transepithelial H⁺ flux if paired with NBCe1 on the opposite membrane.
        </li>
        <li>
          <b>H⁺-K⁺-ATPase:</b> Proton-potassium ATPase; exchanges one H⁺ out and K⁺ in using ATP.<br/>
          <i>Rule:</i> For K⁺, presence of H⁺/K⁺-ATPase on either membrane is sufficient for transepithelial flux. For H⁺, an exit pathway (NBCe1 or HKATPase) must be present on the opposite membrane.
        </li>
        <li>
          <b>NBCe1:</b> Na⁺-bicarbonate symporter; co-transports Na⁺ and HCO₃⁻ out.<br/>
          <i>Rule:</i> Requires Na⁺/K⁺ ATPase present; required for HCO₃⁻ efflux when NHE3 is active.
        </li>
        <li>
          <b>NCC:</b> Na⁺-Cl⁻ symporter; co-transports Na⁺ and Cl⁻ in.<br/>
          <i>Rule:</i> Requires Na⁺/K⁺ ATPase present; transepithelial flux requires NCC or NKCC2 on both membranes.
        </li>
        <li>
          <b>NCX1:</b> Na⁺-Ca²⁺ exchanger; exchanges 3 Na⁺ in for 1 Ca²⁺ out.<br/>
          <i>Rule:</i> Transepithelial Ca²⁺ flux requires NCX1 or PMCA on both membranes.
        </li>
        <li>
          <b>NHE3:</b> Na⁺/H⁺ exchanger; exchanges Na⁺ in for H⁺ out.<br/>
          <i>Rule:</i> Requires Na⁺/K⁺ ATPase present; activity decreases at higher pH; paired with NBCe1 for transepithelial HCO₃⁻ and H⁺ flux.
        </li>
        <li>
          <b>NKCC2:</b> Na⁺-K⁺-2Cl⁻ symporter; co-transports Na⁺, K⁺, and 2 Cl⁻ in.<br/>
          <i>Rule:</i> Requires ROMK on the same membrane and Na⁺/K⁺ ATPase present for activity; for net flux, NKCC2 or NCC must be present on both membranes.
        </li>
        <li>
          <b>Na⁺/K⁺ ATPase:</b> Active pump; extrudes 3 Na⁺ and imports 2 K⁺ per ATP.<br/>
          <i>Rule:</i> Required for activity of all Na⁺-coupled transporters and for transepithelial Na⁺ or K⁺ absorption.
        </li>
        <li>
          <b>PMCA:</b> Plasma membrane Ca²⁺ ATPase; pumps Ca²⁺ out using ATP.<br/>
          <i>Rule:</i> For transepithelial Ca²⁺ flux, PMCA or NCX1 must be on both membranes.
        </li>
        <li>
          <b>ROMK:</b> Potassium channel; allows K⁺ to exit.<br/>
          <i>Rule:</i> Required on the same membrane as NKCC2 for NKCC2 activity; for transepithelial K⁺ flux, ROMK or Na⁺/K⁺ ATPase must be on the opposite membrane.
        </li>
        <li>
          <b>SGLT2:</b> Na⁺-glucose symporter; co-transports Na⁺ and glucose in.<br/>
          <i>Rule:</i> Requires Na⁺/K⁺ ATPase present; for net glucose flux, SGLT2 and GLUT2 must be on opposite membranes.
        </li>
        </ul>
      <h3 className="text-lg font-semibold mt-4 mb-1">Paracellular Pathway Actions & Rules</h3>
      <ul className="list-disc ml-6 text-sm">
        <li><b>Paracellular pathway:</b> Movement of ions and water between cells, bypassing the cell membrane.<br/>
        <i>Rule:</i> Select <b>Tight Junction</b> for no passive leak. Select <b>Cation + Water Pore</b> to enable Na⁺, K⁺, and H₂O flux down their transepithelial concentration gradients (e.g., claudin-2 type), or <b>Anion Pore</b> for Cl⁻ and HCO₃⁻ flux (e.g., claudin-10a or claudin-17 type). The magnitude depends on the permeability setting and the size of the concentration gradient.
        </li>
          </ul>

      <h3 className="text-lg font-semibold mt-4 mb-1">Transepithelial Solute Flux Rules</h3>
      <ul className="list-disc ml-6 text-sm">
        <li><b>Glucose:</b> SGLT2 on one membrane and GLUT2 on the opposite membrane (plus Na⁺/K⁺ ATPase anywhere).</li>
        <li><b>Na⁺:</b> SGLT2, ENaC, NCC, or NKCC2 on one membrane and Na⁺/K⁺ ATPase on the other (pump required).</li>
        <li><b>K⁺:</b> H⁺/K⁺-ATPase on either membrane is sufficient for net transepithelial K⁺ flux. NKCC2 or ROMK on one membrane and ROMK or Na⁺/K⁺ ATPase on the other also support K⁺ flux (pump required).</li>
        <li><b>Cl⁻:</b> NKCC2 or NCC on one membrane and NKCC2 or NCC on the other.</li>
        <li><b>H⁺ and HCO₃⁻:</b> A proton extruder (NHE3, H⁺-ATPase, or H⁺/K⁺-ATPase) on one membrane and NBCe1 on the opposite membrane (plus Na⁺/K⁺ ATPase anywhere). The direction and magnitude of net acid/base flux depends on transporter placement and rates.</li>
        <li><b>H₂O:</b> AQP2 on one membrane and AQP3 on the other (required on opposite sides).</li>
      </ul>
      <Button onClick={() => setShowAbout(false)} className="mt-4">Close</Button>
    </div>
  </div>
)}

<div className="flex h-screen">
<div className="w-1/3 p-4 border-r overflow-auto">
  <div className="text-xl font-bold mb-4 tracking-tight text-blue-800">
    SALT: <span className="font-normal text-gray-700">Secretion &amp; Absorption Learning Tool</span>
  </div><div className="flex space-x-2 mb-4">
  <Button onClick={() => setShowAbout(true)}>About</Button>
<Button variant="outline" onClick={() => setShowSettings(true)}>Settings</Button>
<Button variant="outline" onClick={() => setTransporters(INITIAL_TRANSPORTERS.map(t => ({ ...t })))}>Reset</Button>
</div>
           
        <div className="mt-4">
  <h2 className="text-base font-semibold mb-2">TEST Paracellular Pathway</h2>
  <table className="min-w-full table-auto text-left mb-2">
    <tbody>
      <tr>
        <td className="px-2 py-1">
         <select value={paracellularType} onChange={e => setParacellularType(e.target.value)} className="w-full border rounded p-1">
  <option value="none">Tight Junction</option>
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

        <h2 className="text-base font-semibold mb-4">Transporters</h2>
        <table className="min-w-full table-auto text-left">
  <thead>
    <tr className="bg-gray-100">
      <th className="px-2 py-1">Abbr</th>
      <th className="px-2 py-1">Placement</th>
      <th className="px-2 py-1">Info</th>
    </tr>
  </thead>
  <tbody>
    {transporters.map(t => (
      <tr key={t.id} className="border-t">
        <td className="px-2 py-1">{t.name}</td>
        <td className="px-2 py-1">
          <select value={t.placement} onChange={e => updateTransporter(t.id, 'placement', e.target.value)} className="w-full border rounded p-1">
            <option value="none">None</option>
            <option value="apical">Apical</option>
            <option value="basolateral">Basolateral</option>
          </select>
        </td>
        <td className="px-2 py-1">
          <Button size="sm" variant="outline" onClick={() => { setModalTransporterId(t.id); setShowInfoModal(true); }}>
            Info
          </Button>
        </td>
      </tr>
    ))}
  </tbody>
</table>
{showParaInfo && (
  <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
    <div className="bg-white rounded-lg p-6 max-w-md shadow-lg">
      <h2 className="text-xl font-bold mb-2">Paracellular Pathway Settings</h2>
      {paracellularType === 'cation' && (
        <>
          <div className="mb-2">
            <b>Cation + Water Selective Paracellular Pore</b>: Permeable to Na⁺, K⁺, and H₂O (e.g., Claudin-2 type).<br/>
            <label className="block mt-2 text-sm">Permeability:</label>
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
            <b>Anion Selective Paracellular Pore</b>: Permeable to Cl⁻ and HCO₃⁻ (e.g., claudin-10a or claudin-17 type).<br/>
            <label className="block mt-2 text-sm">Permeability:</label>
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
      {paracellularType === 'none' && (
        <div className="mb-2 text-gray-500">No paracellular pathway enabled (tight junction).</div>
      )}
      <Button className="mt-2" onClick={() => setShowParaInfo(false)}>Close</Button>
    </div>
  </div>
)}
{showSettings && (
  <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
    <div className="bg-white rounded-lg p-6 max-w-md shadow-lg">
      <h2 className="text-xl font-bold mb-4">Compartment Settings</h2>
      <div className="mb-4 text-sm text-gray-700">
        <label className="block mb-2 font-semibold">ECF Model</label>
        <label className="block mb-2">
          <input
            type="radio"
            checked={ecfModel === 'infinite'}
            onChange={() => setEcfModel('infinite')}
          />{' '}
          Infinite ECF <span className="text-gray-500">(no concentration change)</span>
        </label>
        <label className="block mb-2">
          <input
            type="radio"
            checked={ecfModel === 'finite'}
            onChange={() => setEcfModel('finite')}
          />{' '}
          Finite ECF <span className="text-gray-500">(pool size below)</span>
        </label>
        {ecfModel === 'finite' && (
          <div className="ml-4 mb-2">
            <label className="block text-sm mb-1">
              Pool Size (unitless):
              <input
                type="number"
                min="1"
                step="1"
                value={ecfPoolSize}
                onChange={e => setEcfPoolSize(Number(e.target.value))}
                className="border rounded p-1 w-24 ml-2"
              />
            </label>
            <div className="mt-2">
              <label className="block font-semibold mb-1">Water Permeability Model</label>
              <label className="block mb-1">
                <input
                  type="radio"
                  checked={waterModel === 'simple'}
                  onChange={() => setWaterModel('simple')}
                />{' '}
                Simple (ICF always equilibrates with basolateral ECF)
              </label>
              <label className="block mb-1">
                <input
                  type="radio"
                  checked={waterModel === 'detailed'}
                  onChange={() => setWaterModel('detailed')}
                />{' '}
                Detailed (ICF and basolateral ECF can differ if apical or basolateral membranes are water-impermeable)
              </label>
            </div>
          </div>
        )}
      </div>
      <Button className="mt-4" onClick={() => setShowSettings(false)}>
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
        case 'AQP2':
          return <><b>Aquaporin 2</b>: enables rapid H₂O movement.<br/></>;
        case 'AQP3':
          return <><b>Aquaporin 3</b>: enables rapid H₂O movement.<br/></>;
        case 'ENaC':
          return <><b>Epithelial sodium channel</b>: allows passive Na⁺ entry.<br/></>;
        case 'GLUT2':
          return <><b>Glucose transporter 2</b>: allows passive glucose exit.<br/></>;
        case 'HATPase':
          return <><b>Proton-ATPase (V-type)</b>: pumps one H⁺ out per ATP.<br/></>;
        case 'HKATPase':
          return <><b>Proton-potassium ATPase</b>: exchanges one H⁺ out for one K⁺ in per ATP.<br/></>;
        case 'NBCe1':
          return <><b>Electrogenic sodium bicarbonate cotransporter 1</b>: symports Na⁺ and HCO₃⁻ out.<br/></>;
        case 'NCC':
          return <><b>Sodium-chloride cotransporter</b>: symports Na⁺ and Cl⁻ in.<br/></>;
        case 'NCX1':
          return <><b>Sodium-calcium exchanger</b>: antiports 3 Na⁺ in for 1 Ca²⁺ out.<br/></>;
        case 'NHE3':
          return <><b>Sodium–hydrogen exchanger 3</b>: antiports Na⁺ in for H⁺ out.<br/></>;
        case 'NKCC2':
          return <><b>Sodium-potassium-chloride cotransporter</b>: symports Na⁺, K⁺, and 2 Cl⁻ in.<br/></>;
        case 'NaKATPase':
          return <><b>Sodium–potassium pump</b>: pumps 3 Na⁺ out and 2 K⁺ in per ATP.<br/></>;
        case 'PMCA':
          return <><b>Plasma membrane calcium ATPase</b>: pumps one Ca²⁺ out per ATP.<br/></>;
        case 'ROMK':
          return <><b>Renal outer medullary potassium channel</b>: allows passive K⁺ exit, inhibited by internal ATP.<br/></>;
        case 'SGLT2':
          return <><b>Sodium/glucose cotransporter 2</b>: symports Na⁺ and glucose in.<br/></>;
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
      
      <div className="mb-2">
        <label className="block text-sm">Density:</label>
        <input
          type="number"
          min="0"
          step="0.1"
          value={modalTransporter.density}
          onChange={e => updateTransporter(modalTransporter.id, "density", parseFloat(e.target.value))}
          className="border rounded p-1 w-full"
        />
      </div>
      <div className="mb-2">
        <label className="block text-sm">Vmax:</label>
        <input
          type="number"
          step="0.1"
          value={modalTransporter.kinetics.maxRate}
          onChange={e => updateTransporter(modalTransporter.id, "kinetics", { ...modalTransporter.kinetics, maxRate: parseFloat(e.target.value) })}
          className="border rounded p-1 w-full"
        />
      </div>
      <div className="mb-2">
        <label className="block text-sm">Km:</label>
        <input
          type="number"
          step="0.1"
          value={modalTransporter.kinetics.Km}
          onChange={e => updateTransporter(modalTransporter.id, "kinetics", { ...modalTransporter.kinetics, Km: parseFloat(e.target.value) })}
          className="border rounded p-1 w-full"
        />
      </div>
      <Button className="mt-2" onClick={() => setShowInfoModal(false)}>Close</Button>
    </div>
  </div>
)
}

      </div>
      <div className="flex-1 p-4 flex flex-col">
       
 {result && (
          <div className="mt-4 space-y-6 overflow-auto">
            <div>
              <h3 className="font-semibold mb-2">Transmembrane Fluxes (positive = into ICF)</h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={fluxData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <XAxis dataKey="ion" />
                  <YAxis />
                  <ReferenceLine y={0} stroke="#000" strokeWidth={1} />
                  <Tooltip formatter={value => (value?.toFixed ? Number(value).toFixed(2) : value)} />
                  <Legend />
                  <Bar dataKey="apical" name="Apical" fill="#8884d8" />
                  <Bar dataKey="basolateral" name="Basolateral" fill="#82ca9d" />
                  <Bar dataKey="net" name="Net Flux" fill="#ffc658" />
                </BarChart>
              </ResponsiveContainer>
            </div>
           <div>
              <h3 className="font-semibold mb-2">Concentrations</h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={concData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <XAxis dataKey="ion" />
                  <YAxis domain={[0,150]} /><Tooltip formatter={value => (value?.toFixed ? Number(value).toFixed(2) : value)} /><Legend />
                  <Bar dataKey="apicalECF" name="Apical ECF" fill="#8884d8" fillOpacity={0.5} />
                  <Bar dataKey="icf" name="ICF" fill="#82ca9d" fillOpacity={0.8} />
                  <Bar dataKey="basolateralECF" name="Basolateral ECF" fill="#ffc658" fillOpacity={0.5} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div>
              <h3 className="font-semibold mb-2">
              Transepithelial Fluxes, <span className="text-rose-400">Net = {netTEFlux}</span> (positive = absorption, negative = secretion)
            </h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={result?.transepiFluxData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <XAxis dataKey="ion" />
                  <YAxis />
                  <ReferenceLine y={0} stroke="#000" strokeWidth={1} />
                  <Tooltip formatter={value => (value?.toFixed ? Number(value).toFixed(2) : value)} />
                  <Bar dataKey="transepithelial" name="Net Transepithelial" fill="#fb7185" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            
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
