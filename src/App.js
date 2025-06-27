import React, { useState } from 'react';
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

// ====== Button Component (Canvas-Safe, Custom) ======
const Button = ({ children, onClick, className = '', variant, size, disabled = false, ...props }) => (
  <button
    className={
      'rounded px-3 py-1 border ' +
      (disabled
        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
        : variant === 'outline'
          ? 'border-gray-400 bg-white text-blue-600 hover:bg-gray-200'
          : 'bg-blue-500 text-white hover:bg-blue-600') +
      (size === 'sm' ? ' text-xs py-0.5 px-2' : '') +
      ' ' + className
    }
    onClick={disabled ? undefined : onClick}
    disabled={disabled}
    {...props}
  >
    {children}
  </button>
);

// =====================
// CONSTANTS & HELPERS
// =====================

const SOLUTES = ['Na+', 'K+', 'Cl-', 'HCO3-', 'Ca2+', 'Glucose'];

const INITIAL_CONCENTRATIONS = {
  apicalECF:     { 'Na+':145, 'K+':4,   'Cl-':105, 'H+':0.00004, 'HCO3-':24, 'Ca2+':1.2, 'Glucose':5,  'H2O':100 },
  icf:           { 'Na+':12,  'K+':140, 'Cl-':10,  'H+':0.00002, 'HCO3-':10, 'Ca2+':0.0001,'Glucose':1,  'H2O':100 },
  basolateralECF:{ 'Na+':145, 'K+':4,   'Cl-':105, 'H+':0.00004, 'HCO3-':24, 'Ca2+':1.2, 'Glucose':5,  'H2O':100 }
};

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

function placementsForTick(id, tList) {
  return tList.filter(t => t.id === id && t.placement !== 'none').map(t => t.placement);
}

function transepithelialFlux(ion, entryIds, exitIds, requirePump, apicalFlux, basolateralFlux, tList, hasNaKATPase) {
  if (requirePump && !hasNaKATPase) return 0;
  const entrySides = [].concat(...entryIds.map(id => placementsForTick(id, tList)));
  const exitSides = [].concat(...exitIds.map(id => placementsForTick(id, tList)));
  let flux = 0;
  for (let side1 of entrySides) {
    for (let side2 of exitSides) {
      if (side1 === side2) continue;
      const fromFlux = side1 === 'apical' ? (apicalFlux[ion] ?? 0) : (basolateralFlux[ion] ?? 0);
      const toFlux   = side2 === 'apical' ? (apicalFlux[ion] ?? 0) : (basolateralFlux[ion] ?? 0);
      if (fromFlux > 0 && toFlux < 0) {
        flux += Math.min(Math.abs(fromFlux), Math.abs(toFlux));
      } else if (fromFlux < 0 && toFlux > 0) {
        flux -= Math.min(Math.abs(fromFlux), Math.abs(toFlux));
      }
    }
  }
  return flux;
}

function computeTepSign(result) {
  if (!result || !result.transepiFluxData) return 0;
  const ionCharge = {
    'Na+': 1,
    'K+': 1,
    'Ca2+': 2,
    'Cl-': -1,
    'HCO3-': -1,
    'H+': 1,
  };
  let chargeSum = 0;
  result.transepiFluxData.forEach(row => {
    if (ionCharge[row.ion]) {
      chargeSum += row.transepithelial * ionCharge[row.ion];
    }
  });
  return -chargeSum;
}

// =====================
// MAIN APP COMPONENT
// =====================

export default function App() {
  // --- STATE HOOKS ---
  const [showAbout, setShowAbout] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [modalTransporterId, setModalTransporterId] = useState(null);
  const [transporters, setTransporters] = useState(INITIAL_TRANSPORTERS);
  const [apicalECF, setApicalECF] = useState({ ...INITIAL_CONCENTRATIONS.apicalECF });
  const [basolateralECF, setBasolateralECF] = useState({ ...INITIAL_CONCENTRATIONS.basolateralECF });
  const [paracellularType, setParacellularType] = useState('none');
  const [paraCationPerm, setParaCationPerm] = useState(1.0);
  const [paraAnionPerm, setParaAnionPerm] = useState(1.0);
  const [showParaInfo, setShowParaInfo] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [result, setResult] = useState(null);
  const [isStale, setIsStale] = useState(true);

  // --- UI HANDLERS ---
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
    setIsStale(true);
  };

  const handleECFChange = (which, ion, value) => {
    if (which === 'apical') {
      setApicalECF(prev => ({ ...prev, [ion]: value }));
    } else {
      setBasolateralECF(prev => ({ ...prev, [ion]: value }));
    }
    setIsStale(true);
  };

  const handleResetECF = () => {
    setApicalECF({ ...INITIAL_CONCENTRATIONS.apicalECF });
    setBasolateralECF({ ...INITIAL_CONCENTRATIONS.basolateralECF });
    setIsStale(true);
  };

  const handleCalculate = () => {
    calculateFluxesAndConcs(
      transporters,
      apicalECF,
      basolateralECF,
      paracellularType,
      paraCationPerm,
      paraAnionPerm,
      setResult
    );
    setIsStale(false);
  };

  // =============================
  // CALCULATION LOGIC (INFINITE ECF ONLY!)
  // =============================

  function calculateFluxesAndConcs(
    tList,
    apicalECF,
    basolateralECF,
    paracellularType,
    paraCationPerm,
    paraAnionPerm,
    setResult
  ) {
    const apicalFlux = {};
    const basolateralFlux = {};
    Object.keys(INITIAL_CONCENTRATIONS.apicalECF).forEach(ion => { apicalFlux[ion] = 0; basolateralFlux[ion] = 0; });

    const hasNaKATPase = tList.some(t => t.id === 'NaKATPase' && t.placement !== 'none');

    // 1. Calculate apical and basolateral TM fluxes for all ions except H2O
    tList.forEach(t => {
      if (t.stoich['Na+'] && !hasNaKATPase) return;
      if (t.placement === 'none') return;

      let rate = (t.kinetics.maxRate / (t.kinetics.Km + 1)) * t.density;
      if (t.id === 'NHE3') {
        const h = INITIAL_CONCENTRATIONS.icf['H+'];
        const pH = -Math.log10(h);
        const pH50 = 7.2;
        const sigma = 0.05;
        rate *= 1 / (1 + Math.exp((pH - pH50) / sigma));
      }
      Object.entries(t.stoich).forEach(([ion, coeff]) => {
        if (ion === 'H2O') return;
        const delta = rate * coeff;
        if (t.placement === 'apical') apicalFlux[ion] += delta;
        else basolateralFlux[ion] += delta;
      });
    });

    // 2. Paracellular Pathway Fluxes
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

    // 3. Net fluxes
    const netFlux = {};
    Object.keys(apicalFlux).forEach(ion => { netFlux[ion] = apicalFlux[ion] + basolateralFlux[ion] + (paraFlux[ion] || 0); });

    // 4. ICF concentrations (not changed in infinite mode)
    const newICF = { ...INITIAL_CONCENTRATIONS.icf };
    Object.entries(netFlux).forEach(([ion, flux]) => { newICF[ion] += flux; });
    newICF['H+'] = Math.max(newICF['H+'], 1e-8);

    // 5. Transepithelial fluxes (for display)
    const transepiFluxData = Object.keys(netFlux).filter(ion => ion !== 'H2O').map(ion => {
      const apical = apicalFlux[ion] ?? 0;
      const basolateral = basolateralFlux[ion] ?? 0;
      let teFlux = 0;
      if (apical > 0 && basolateral < 0) {
        teFlux = Math.min(apical, Math.abs(basolateral));
      } else if (apical < 0 && basolateral > 0) {
        teFlux = -Math.min(Math.abs(apical), basolateral);
      }
      // Add paracellular flux if present
      return {
        ion,
        transepithelial: teFlux + (paraFlux[ion] || 0)
      };
    });

    // 6. H2O logic: handled in one place for simple/infinite model
    const aqp2Sides = placementsForTick('AQP2', tList);
    const aqp3Sides = placementsForTick('AQP3', tList);
    const hasAQP2_apical = aqp2Sides.includes('apical');
    const hasAQP2_bl = aqp2Sides.includes('basolateral');
    const hasAQP3_apical = aqp3Sides.includes('apical');
    const hasAQP3_bl = aqp3Sides.includes('basolateral');
    const hasTranscellularH2O = (hasAQP2_apical && hasAQP3_bl) || (hasAQP2_bl && hasAQP3_apical);
    const hasParacellularH2O = paracellularType === 'cation';

    apicalFlux['H2O'] = 0;
    basolateralFlux['H2O'] = 0;

    let h2oTransEpiFlux = 0;
    if ((hasTranscellularH2O || hasParacellularH2O)) {
      const netTEFluxNum = transepiFluxData.reduce((sum, row) => sum + row.transepithelial, 0);
      h2oTransEpiFlux = 0.5 * Math.sign(netTEFluxNum) * Math.min(Math.abs(netTEFluxNum), 5);
      apicalFlux['H2O'] = h2oTransEpiFlux;
      basolateralFlux['H2O'] = -h2oTransEpiFlux;
    }

    transepiFluxData.push({ ion: 'H2O', transepithelial: h2oTransEpiFlux });

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
  }

  // --- DATA FOR CHARTS ---
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

  const netTEFlux = result?.transepiFluxData
    ?.filter(row => row.ion !== 'H2O')
    .reduce((sum, row) => sum + row.transepithelial, 0)
    .toFixed(3);

  const tepNetCharge = computeTepSign(result);
  let tepIndicator = "Neutral";
  if (tepNetCharge > 2) tepIndicator = "Apical positive (large)";
  else if (tepNetCharge > 0.1) tepIndicator = "Apical positive";
  else if (tepNetCharge < -2) tepIndicator = "Apical negative (large)";
  else if (tepNetCharge < -0.1) tepIndicator = "Apical negative";

  // --- MAIN RETURN ---
  return (
<>
  {/* About Modal */}
  {showAbout && (
  <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
    <div className="bg-white rounded-lg p-6 max-w-2xl shadow-lg overflow-y-auto max-h-[80vh]">
      <h2 className="text-2xl font-bold mb-4">The Secretion and Absorption Learning Tool</h2>
      <div className="mb-3 text-sm text-gray-700">
        <h3 className="text-lg font-semibold mt-4 mb-1">About SALT</h3>
      <ul className="list-disc ml-6 mb-3 text-sm">
        <li>This app simulates and visualizes transmembrane and transepithelial fluxes of key solutes and water across an epithelial cell layer, allowing instructors and learners to explore how membrane transporters, paracellular pathways, and compartment properties shape solute and water movement. It is designed to illustrate key physiological principles in a flexible and interactive environment, with parameter choices reflecting the user’s instructional objectives.</li>
        <li>Developed by David Julian &middot; <a href="mailto:djulian@ufl.edu" className="underline text-blue-600">djulian@ufl.edu</a></li>
      </ul>
      </div>
      {/* ... [rest of About modal unchanged; you can trim for brevity if needed] ... */}
      <Button onClick={() => setShowAbout(false)} className="mt-4">Close</Button>
    </div>
  </div>
  )}
  {/* Settings Modal */}
  {showSettings && (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl shadow-lg overflow-y-auto max-h-[80vh]">
        <h2 className="text-2xl font-bold mb-4">Edit ECF Solute Concentrations</h2>
        <div className="flex flex-row space-x-8">
          {[['Apical ECF', apicalECF, setApicalECF, 'apical'],
            ['Basolateral ECF', basolateralECF, setBasolateralECF, 'basolateral']].map(
              ([label, comp, , which]) => (
                <div key={label}>
                  <h3 className="font-semibold mb-2">{label}</h3>
                  <table className="table-auto">
                    <tbody>
                      {SOLUTES.map(ion => (
                        <tr key={ion}>
                          <td className="pr-2">{ion}</td>
                          <td>
                            <input
                              type="number"
                              min={0}
                              step={0.1}
                              value={comp[ion]}
                              onChange={e =>
                                handleECFChange(
                                  which,
                                  ion,
                                  Math.max(0, parseFloat(e.target.value))
                                )
                              }
                              className="border rounded p-1 w-20"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
        </div>
        <Button className="mt-4 mr-2" onClick={handleResetECF}>Reset to Normal</Button>
        <Button className="mt-4" onClick={() => setShowSettings(false)}>
          Close
        </Button>
      </div>
    </div>
  )}
  {/* Paracellular Pathway Modal */}
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
  {/* Transporter Info Modal */}
  {showInfoModal && (() => {
    const modalTransporter = transporters.find(t => t.id === modalTransporterId);
    if (!modalTransporter) return null;
    return (
      <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md shadow-lg">
          <h2 className="text-xl font-bold mb-2">{modalTransporter.name}</h2>
          <div className="mb-2 text-sm">
            <div>
              {/* [Transporter info by ID, as in your code...] */}
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
    );
  })()}
  <div className="flex h-screen">
    <div className="w-1/3 p-4 border-r overflow-auto">
      <div className="text-xl font-bold mb-4 tracking-tight text-blue-800">
        SALT: <span className="font-normal text-gray-700">Secretion &amp; Absorption Learning Tool</span>
      </div>
      <div className="flex space-x-2 mb-4">
        <Button onClick={() => setShowAbout(true)}>About</Button>
        <Button variant="outline" onClick={() => setShowSettings(true)}>Settings</Button>
        <Button variant="outline" onClick={() => setTransporters(INITIAL_TRANSPORTERS.map(t => ({ ...t })))}>Reset</Button>
      </div>
      <div className="mt-4">
        <h2 className="text-base font-semibold mb-2">Paracellular Pathway</h2>
        <table className="min-w-full table-auto text-left mb-2">
          <tbody>
            <tr>
              <td className="px-2 py-1">
                <select value={paracellularType} onChange={e => { setParacellularType(e.target.value); setIsStale(true); }} className="w-full border rounded p-1">
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
    </div>
    <div className="flex-1 p-4 flex flex-col">
      <Button
        className={`my-3 ${isStale ? "" : "bg-gray-300 text-gray-500 cursor-not-allowed"}`}
        onClick={handleCalculate}
        disabled={!isStale}
      >
        Calculate
      </Button>
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
                <YAxis domain={[0,150]} />
                <Tooltip formatter={value => (value?.toFixed ? Number(value).toFixed(2) : value)} />
                <Legend />
                <Bar dataKey="apicalECF" name="Apical ECF" fill="#8884d8" fillOpacity={0.5} />
                <Bar dataKey="icf" name="ICF" fill="#82ca9d" fillOpacity={0.8} />
                <Bar dataKey="basolateralECF" name="Basolateral ECF" fill="#ffc658" fillOpacity={0.5} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex items-center space-x-2">
            <span className="font-semibold">Transepithelial Potential:</span>
            <span
              className={
                tepNetCharge > 0.1 ? "text-red-700 font-bold" :
                tepNetCharge < -0.1 ? "text-blue-700 font-bold" :
                "text-gray-500"
              }
            >
              {tepIndicator}
            </span>
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
