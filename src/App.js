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

const SOLUTES = ['Na+', 'K+', 'Cl-', 'HCO3-', 'Ca2+', 'Glucose', 'AminoAcid'];

const INITIAL_CONCENTRATIONS = {
  apicalECF:     { 'Na+':145, 'K+':4,   'Cl-':105, 'H+':0.00004, 'HCO3-':24, 'Ca2+':1.2, 'Glucose':5, 'AminoAcid':2, 'H2O':100 },
  icf:           { 'Na+':12,  'K+':140, 'Cl-':10,  'H+':0.00002, 'HCO3-':10, 'Ca2+':0.0001,'Glucose':1, 'AminoAcid':8, 'H2O':100 },
  basolateralECF:{ 'Na+':145, 'K+':4,   'Cl-':105, 'H+':0.00004, 'HCO3-':24, 'Ca2+':1.2, 'Glucose':5, 'AminoAcid':2, 'H2O':100 }
};

const INITIAL_TRANSPORTERS = [
  // AQPs: One entry, allows "apical", "basolateral", "both", or "none"
  { id: 'AQP', name: 'Aquaporin (Water Channel)', type: 'channel',
    stoich: { 'H2O': 1 }, kinetics: { maxRate: 1.0, Km: 1.0 }, placement: 'none', density: 1 },

  // SGLT: Generic, with SGLT1/SGLT2 switch (see modal code for switch logic)
  { id: 'SGLT', name: 'SGLT (Na⁺-Glucose Cotransporter)', type: 'symporter',
    stoich: { 'Na+': 2, 'Glucose': 1 }, // Default SGLT1 stoich
    stoichType: 'SGLT1', // 'SGLT1' or 'SGLT2'
    kinetics: { maxRate: 0.8, Km: 1.0 }, placement: 'none', density: 1 },

  // NKCC: Generic Na⁺-K⁺-2Cl⁻ cotransporter (represents NKCC1 and NKCC2)
  { id: 'NKCC', name: 'NKCC (Na⁺-K⁺-2Cl⁻ Cotransporter)', type: 'symporter',
    stoich: { 'Na+': 1, 'K+': 1, 'Cl-': 2 },
    kinetics: { maxRate: 1.0, Km: 1.0 }, placement: 'none', density: 1 },

  // NHE: Generic Na⁺/H⁺ exchanger
  { id: 'NHE', name: 'NHE (Na⁺/H⁺ Exchanger)', type: 'antiporter',
    stoich: { 'Na+': 1, 'H+': -1 },
    kinetics: { maxRate: 1.0, Km: 1.0 }, placement: 'none', density: 1 },

  // Cl⁻/HCO₃⁻ Exchanger: Generic (represents DRA, Pendrin, etc.)
  { id: 'ClHCO3Ex', name: 'Cl⁻/HCO₃⁻ Exchanger', type: 'exchanger',
    stoich: { 'Cl-': -1, 'HCO3-': 1 },
    kinetics: { maxRate: 0.8, Km: 1.0 }, placement: 'none', density: 1 },

  // K⁺ Channel: Generic (ROMK, BK, etc.)
  { id: 'KChannel', name: 'K⁺ Channel', type: 'channel',
    stoich: { 'K+': -1 },
    kinetics: { maxRate: 0.8, Km: 1.0 }, placement: 'none', density: 1 },

  // ENaC: Apical Na⁺ channel
  { id: 'ENaC', name: 'ENaC (Epithelial Na⁺ Channel)', type: 'channel',
    stoich: { 'Na+': 1 },
    kinetics: { maxRate: 1.0, Km: 1.0 }, placement: 'none', density: 1 },

  // CFTR: Apical Cl⁻ channel
  { id: 'CFTR', name: 'CFTR (Cl⁻ Channel)', type: 'channel',
    stoich: { 'Cl-': 1 },
    kinetics: { maxRate: 1.0, Km: 1.0 }, placement: 'none', density: 1 },

  // Na⁺/K⁺-ATPase: Basolateral pump
  { id: 'NaKATPase', name: 'Na⁺/K⁺-ATPase', type: 'pump',
    stoich: { 'Na+': -3, 'K+': 2 },
    kinetics: { maxRate: 1.2, Km: 1.0 }, placement: 'none', density: 1 },

  // GLUT2: Basolateral glucose uniporter
  { id: 'GLUT2', name: 'GLUT2 (Glucose Uniporter)', type: 'channel',
    stoich: { 'Glucose': -1 },
    kinetics: { maxRate: 1.0, Km: 1.0 }, placement: 'none', density: 1 },

  // NBC: Basolateral Na⁺/HCO₃⁻ cotransporter
  { id: 'NBC', name: 'NBC (Na⁺/HCO₃⁻ Cotransporter)', type: 'symporter',
    stoich: { 'Na+': 1, 'HCO3-': 3 }, // Common stoich
    kinetics: { maxRate: 0.7, Km: 2.0 }, placement: 'none', density: 1 },

  // H⁺-ATPase: Apical proton pump
  { id: 'HATPase', name: 'H⁺-ATPase (Proton Pump)', type: 'pump',
    stoich: { 'H+': -1 },
    kinetics: { maxRate: 0.9, Km: 1.0 }, placement: 'none', density: 1 },

  // TRPV6: Apical Ca²⁺ channel
  { id: 'TRPV6', name: 'TRPV6 (Ca²⁺ Channel)', type: 'channel',
    stoich: { 'Ca2+': 1 },
    kinetics: { maxRate: 0.2, Km: 0.05 }, placement: 'none', density: 1 },

  // PMCA: Basolateral Ca²⁺-ATPase (extrudes Ca²⁺)
  { id: 'PMCA', name: 'PMCA (Ca²⁺-ATPase)', type: 'pump',
    stoich: { 'Ca2+': -1 },
    kinetics: { maxRate: 0.3, Km: 0.5 }, placement: 'none', density: 1 },

  // Na⁺-Amino Acid Cotransporter
  { id: 'NAAT', name: 'Na⁺-Amino Acid Cotransporter', type: 'symporter',
    stoich: { 'Na+': 1, 'AminoAcid': 1 },
    kinetics: { maxRate: 0.6, Km: 0.5 }, placement: 'none', density: 1 },
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
// --- General-purpose Tooltip with consistent styling ---
const StyledTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-white border rounded shadow p-2 text-xs">
      <div className="font-bold mb-1">{label}</div>
      {payload.map((entry, idx) => (
        <div key={idx}>
          <span style={{ color: entry.color }}>{entry.name}:</span>{" "}
          {Number(entry.value).toFixed(2)}
        </div>
      ))}
    </div>
  );
};

// --- Custom Tooltip for Concentrations Chart (Apical, ICF, Basolateral order) ---
const ConcentrationTooltip = ({ active, payload, label }) => {
  if (!active || !payload) return null;
  // Desired order for bars and tooltip
  const order = [
    { key: "apicalECF", name: "Apical ECF" },
    { key: "icf", name: "ICF" },
    { key: "basolateralECF", name: "Basolateral ECF" }
  ];
  // Find and order payload items
  const ordered = order
    .map(({ key, name }) => {
      const entry = payload.find(item => item.dataKey === key);
      return entry ? { ...entry, displayName: name } : null;
    })
    .filter(Boolean);

  return (
    <div className="bg-white border rounded shadow p-2 text-xs">
      <div className="font-bold mb-1">{label}</div>
      {ordered.map((entry, idx) => (
        <div key={idx}>
          <span style={{ color: entry.color }}>{entry.displayName}:</span>{" "}
          {Number(entry.value).toFixed(2)}
        </div>
      ))}
    </div>
  );
};

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

  // Add ICF memory between calculations
  const [icf, setIcf] = useState({ ...INITIAL_CONCENTRATIONS.icf });

  const handleResetECF = () => {
    setApicalECF({ ...INITIAL_CONCENTRATIONS.apicalECF });
    setBasolateralECF({ ...INITIAL_CONCENTRATIONS.basolateralECF });
    setIcf({ ...INITIAL_CONCENTRATIONS.icf }); // <-- reset ICF also!
    setIsStale(true);
  };

const handleCalculate = () => {
  // Always start from baseline ICF
  const baselineICF = { ...INITIAL_CONCENTRATIONS.icf };
  calculateFluxesAndConcs(
    transporters,
    apicalECF,
    basolateralECF,
    paracellularType,
    paraCationPerm,
    paraAnionPerm,
    baselineICF,   // <<-- Always use the baseline!
    setResult,
    setIcf         // <- This stores the converged value, but it will not be used as input next time.
  );
  setIsStale(false);
};


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

   // =============================
  // CALCULATION LOGIC
  // =============================

function calculateFluxesAndConcs(
  tList,
  apicalECF,
  basolateralECF,
  paracellularType,
  paraCationPerm,
  paraAnionPerm,
  icf,            // <-- take icf from state
  setResult,
  setIcf
) {
  // -------------- PARAMETERS --------------
  const maxSteps = 1000;            // Maximum iterations to prevent infinite loops
  const fluxThreshold = 1e-6;       // Stop when all net fluxes are below this (steady state)
  const dt = 0.1;                   // "Time" step for each update; keep ≤1 for stability

  // -------------- INITIALIZE --------------
  let newICF = { ...icf };

  // Internal function to calculate fluxes for current ICF
  function getFluxes(currentICF) {
  // Step 1. Calculate TM fluxes
  const apicalFlux = {};
  const basolateralFlux = {};
  Object.keys(INITIAL_CONCENTRATIONS.apicalECF).forEach(ion => { apicalFlux[ion] = 0; basolateralFlux[ion] = 0; });

  // TRANSPORTER FLUXES (all saturable/MM)
 tList.forEach(t => {
  if (t.placement === 'none') return;

  let rate = 0;
  let fromComp = null, toComp = null;

  // Support AQP "both" (for water) and all others as before
  // For AQP, we handle water flux elsewhere, so skip flux calculation here
  if (t.id === 'AQP') return;

  // Assign compartment pointers
  if (t.placement === 'apical' || (t.placement === 'both' && t.id === 'AQP')) {
    fromComp = apicalECF;
    toComp = currentICF;
  } else if (t.placement === 'basolateral') {
    fromComp = basolateralECF;
    toComp = currentICF;
  }

  // Saturable Michaelis-Menten for ALL, with multi-site limiting for co-transporters/exchangers
  // 1. SGLT (toggle stoichiometry with t.stoich)
  if (t.id === 'SGLT') {
    // Limiting substrate for Na+ and Glucose
    const naSub = Math.max(0, fromComp['Na+']);
    const gluSub = Math.max(0, fromComp['Glucose']);
    const naNeeded = t.stoich['Na+'];
    const gluNeeded = t.stoich['Glucose'];
    // Find the min ratio (accounts for both SGLT1 and SGLT2 stoichiometry)
    const naAvail = naSub / naNeeded;
    const gluAvail = gluSub / gluNeeded;
    const limiting = Math.min(naAvail, gluAvail);
    rate = t.kinetics.maxRate * limiting / (t.kinetics.Km + limiting) * t.density;
  }
  // 2. NKCC (Na+ : K+ : 2Cl-), all 1-site except 2 for Cl-
  else if (t.id === 'NKCC') {
    const naSub = Math.max(0, fromComp['Na+']);
    const kSub = Math.max(0, fromComp['K+']);
    const clSub = Math.max(0, fromComp['Cl-']);
    const naNeeded = 1, kNeeded = 1, clNeeded = 2;
    const naAvail = naSub / naNeeded;
    const kAvail = kSub / kNeeded;
    const clAvail = clSub / clNeeded;
    const limiting = Math.min(naAvail, kAvail, clAvail);
    rate = t.kinetics.maxRate * limiting / (t.kinetics.Km + limiting) * t.density;
  }
  // 3. NHE (Na+/H+ exchanger)
  else if (t.id === 'NHE') {
    const naSub = Math.max(0, fromComp['Na+']);
    const hSub = Math.max(0, toComp['H+']);
    const limiting = Math.min(naSub, hSub);
    rate = t.kinetics.maxRate * limiting / (t.kinetics.Km + limiting) * t.density;
  }
  // 4. Cl-/HCO3- Exchanger
  else if (t.id === 'ClHCO3Ex') {
    const clSub = Math.max(0, fromComp['Cl-']);
    const hco3Sub = Math.max(0, toComp['HCO3-']);
    const limiting = Math.min(clSub, hco3Sub);
    rate = t.kinetics.maxRate * limiting / (t.kinetics.Km + limiting) * t.density;
  }
// 5. KChannel (simple MM, K+ channel)
else if (t.id === 'KChannel') {
  let grad = 0;
  if (t.placement === 'apical') {
    grad = currentICF['K+'] - apicalECF['K+'];
  } else if (t.placement === 'basolateral') {
    grad = currentICF['K+'] - basolateralECF['K+'];
  }
  const absGrad = Math.abs(grad);
  rate = t.kinetics.maxRate * absGrad / (t.kinetics.Km + absGrad) * Math.sign(grad) * t.density;
}
// 6. ENaC (simple MM, Na+ channel)
else if (t.id === 'ENaC') {
  let grad = 0;
  if (t.placement === 'apical') {
    grad = currentICF['Na+'] - apicalECF['Na+'];
  } else if (t.placement === 'basolateral') {
    grad = currentICF['Na+'] - basolateralECF['Na+'];
  }
  const absGrad = Math.abs(grad);
  rate = t.kinetics.maxRate * absGrad / (t.kinetics.Km + absGrad) * Math.sign(grad) * t.density;
}
// 7. CFTR (simple MM, Cl- channel)
else if (t.id === 'CFTR') {
  let grad = 0;
  if (t.placement === 'apical') {
    grad = currentICF['Cl-'] - apicalECF['Cl-'];
  } else if (t.placement === 'basolateral') {
    grad = currentICF['Cl-'] - basolateralECF['Cl-'];
  }
  const absGrad = Math.abs(grad);
  rate = t.kinetics.maxRate * absGrad / (t.kinetics.Km + absGrad) * Math.sign(grad) * t.density;
}
  // 8. NaKATPase (MM limited by ICF Na+ and ECF K+)
 else if (t.id === 'NaKATPase') {
  const na_icf = toComp['Na+'];
  const k_ecf = fromComp['K+'];
  const k_icf = toComp['K+'];
  const Km_Na = t.kinetics.Km || 10;
  const Km_K = t.kinetics.Km || 1.5;
  // Require sufficient ICF Na and ICF K (for efflux), and ECF K (for influx)
  const lim_Na = na_icf / (Km_Na + na_icf);
  const lim_Kecf = k_ecf / (Km_K + k_ecf);
  const lim_Kicf = k_icf / (Km_K + k_icf);
  rate = t.kinetics.maxRate * Math.min(lim_Na, lim_Kecf, lim_Kicf) * t.density;
}
  // 9. GLUT2 (bidirectional, glucose uniporter)
  else if (t.id === 'GLUT2') {
    const grad = toComp['Glucose'] - fromComp['Glucose'];
    const absGrad = Math.abs(grad);
    rate = t.kinetics.maxRate * absGrad / (t.kinetics.Km + absGrad) * Math.sign(grad) * t.density;
  }
  // 10. NBC (Na+/3HCO3-)
  else if (t.id === 'NBC') {
    const naSub = Math.max(0, fromComp['Na+']);
    const hco3Sub = Math.max(0, fromComp['HCO3-']);
    const naNeeded = 1, hco3Needed = 3;
    const naAvail = naSub / naNeeded;
    const hco3Avail = hco3Sub / hco3Needed;
    const limiting = Math.min(naAvail, hco3Avail);
    rate = t.kinetics.maxRate * limiting / (t.kinetics.Km + limiting) * t.density;
  }
  // 11. HATPase (proton pump)
  else if (t.id === 'HATPase') {
    const hSub = Math.max(0, toComp['H+']);
    rate = t.kinetics.maxRate * hSub / (t.kinetics.Km + hSub) * t.density;
  }
  // 12. TRPV6 (apical Ca2+ channel)
  else if (t.id === 'TRPV6') {
    const grad = fromComp['Ca2+'] - toComp['Ca2+'];
    const absGrad = Math.abs(grad);
    rate = t.kinetics.maxRate * absGrad / (t.kinetics.Km + absGrad) * Math.sign(grad) * t.density;
  }
  // 13. PMCA (basolateral Ca2+ ATPase)
  else if (t.id === 'PMCA') {
    const caSub = Math.max(0, toComp['Ca2+']);
    rate = t.kinetics.maxRate * caSub / (t.kinetics.Km + caSub) * t.density;
  }
  // 14. Na+-Amino Acid Cotransporter (NAAT)
  else if (t.id === 'NAAT') {
    const naSub = Math.max(0, fromComp['Na+']);
    const aaSub = Math.max(0, fromComp['AminoAcid']);
    const limiting = Math.min(naSub, aaSub);
    rate = t.kinetics.maxRate * limiting / (t.kinetics.Km + limiting) * t.density;
  }
  // fallback: single-site MM for main ion (in case any missed)
  else {
    let mainIon = Object.keys(t.stoich)[0];
    const substrate = Math.max(0, fromComp[mainIon]);
    rate = t.kinetics.maxRate * substrate / (t.kinetics.Km + substrate) * t.density;
  }

  // Apply stoichiometry to fluxes (ignore water here)
  Object.entries(t.stoich).forEach(([ion, coeff]) => {
    if (ion === 'H2O') return;
    const delta = rate * coeff;
    if (t.placement === 'apical') apicalFlux[ion] += delta;
    else if (t.placement === 'basolateral') basolateralFlux[ion] += delta;
    else if (t.placement === 'both' && t.id === 'AQP') {
      // skip for water here, handled later
    }
  });
});

  // Step 2. Paracellular Pathway Fluxes
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

  // Step 3. Net fluxes
  const netFlux = {};
  Object.keys(apicalFlux).forEach(ion => { netFlux[ion] = apicalFlux[ion] + basolateralFlux[ion] + (paraFlux[ion] || 0); });

  return { apicalFlux, basolateralFlux, paraFlux, netFlux };
}


  // -------------- ITERATION LOOP --------------
  let step = 0;
  let done = false;
  let finalFluxes = null;

  while (!done && step < maxSteps) {
    const { apicalFlux, basolateralFlux, paraFlux, netFlux } = getFluxes(newICF);

    // Update ICF for next step (Euler)
    let maxChange = 0;
    const updatedICF = { ...newICF };
    Object.entries(netFlux).forEach(([ion, flux]) => {
      updatedICF[ion] += flux * dt;
      maxChange = Math.max(maxChange, Math.abs(flux * dt));
    });
    updatedICF['H+'] = Math.max(updatedICF['H+'], 1e-8);

    // Clamp all concentrations to >= 0
    Object.keys(updatedICF).forEach(ion => {
      updatedICF[ion] = Math.max(0, updatedICF[ion]);
    });
    
    // Test for steady state (all fluxes very small)
    if (maxChange < fluxThreshold) {
      done = true;
      finalFluxes = { apicalFlux, basolateralFlux, paraFlux, netFlux };
    }
    newICF = updatedICF;
    step++;
  }

  // -------------- FINAL DISPLAY FLUXES --------------
  // If loop exited before convergence, get final fluxes anyway
  if (!finalFluxes) finalFluxes = getFluxes(newICF);

  // Step 5. Transepithelial fluxes (for display)
  const transepiFluxData = Object.keys(finalFluxes.netFlux).filter(ion => ion !== 'H2O').map(ion => {
    const apical = finalFluxes.apicalFlux[ion] ?? 0;
    const basolateral = finalFluxes.basolateralFlux[ion] ?? 0;
    let teFlux = 0;
    if (apical > 0 && basolateral < 0) {
      teFlux = Math.min(apical, Math.abs(basolateral));
    } else if (apical < 0 && basolateral > 0) {
      teFlux = -Math.min(Math.abs(apical), basolateral);
    }
    // Add paracellular flux if present
    return {
      ion,
      transepithelial: teFlux + (finalFluxes.paraFlux[ion] || 0)
    };
  });

 // Step 6. Water flux logic (for AQP, including "both")
const aqpPlacement = transporters.find(t => t.id === 'AQP')?.placement ?? 'none';
const hasAQP_apical = aqpPlacement === 'apical' || aqpPlacement === 'both';
const hasAQP_bl = aqpPlacement === 'basolateral' || aqpPlacement === 'both';
const hasTranscellularH2O = hasAQP_apical && hasAQP_bl;
const hasParacellularH2O = paracellularType === 'cation';

finalFluxes.apicalFlux['H2O'] = 0;
finalFluxes.basolateralFlux['H2O'] = 0;

let h2oTransEpiFlux = 0;
if (hasTranscellularH2O || hasParacellularH2O) {
  const netTEFluxNum = transepiFluxData.reduce((sum, row) => sum + row.transepithelial, 0);
  h2oTransEpiFlux = 0.5 * Math.sign(netTEFluxNum) * Math.min(Math.abs(netTEFluxNum), 5);
  finalFluxes.apicalFlux['H2O'] = h2oTransEpiFlux;
  finalFluxes.basolateralFlux['H2O'] = -h2oTransEpiFlux;
}

transepiFluxData.push({ ion: 'H2O', transepithelial: h2oTransEpiFlux });

  // Step 7. Store results (show the converged state)
  setResult({
    apicalFlux: finalFluxes.apicalFlux,
    basolateralFlux: finalFluxes.basolateralFlux,
    netFlux: finalFluxes.netFlux,
    concentrations: {
      apicalECF,
      icf: newICF,
      basolateralECF
    },
    paraFlux: finalFluxes.paraFlux,
    transepiFluxData
  });
  setIcf(newICF);   // <-- update the ICF state to steady state
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
      <div className="mt-6 p-3 rounded bg-gray-100 text-xs text-gray-700 border border-gray-200">
        <b>Modeling Limitations & Assumptions:</b>
        <ul className="list-disc ml-6 mt-1">
            <li><b>No membrane voltage:</b> The model does not calculate or use transmembrane electrical potential. All channel and transporter fluxes are determined by concentration gradients alone. In real cells, membrane voltage can strongly influence ion movement.</li>
            <li><b>Fixed volumes and simplified water flux:</b> Cell and compartment volumes are constant. Osmotic gradients and resulting volume changes are not modeled; water movement reflects the presence of pathways only.</li>
            <li><b>Simplified kinetics and stoichiometry:</b> All transporter and channel activities use Michaelis-Menten saturation, and parameters may not match true physiological values for all tissues. Stoichiometries are representative but generic in some cases.</li>
            <li><b>Generic transporters:</b> Several transporters (e.g., SGLT, NKCC, NHE) represent families or isoforms, not individual gene products.</li>
            <li><b>Not all solutes are represented:</b> The simulation includes a selected set of major ions and solutes; many others are omitted for simplicity.</li>
        </ul>
</div>
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
        {modalTransporter.id === 'SGLT' && (
          <div className="mb-2">
            <label className="block text-sm font-semibold">Isoform:</label>
            <select
              value={modalTransporter.stoichType}
              onChange={e => {
                const stoichType = e.target.value;
                let newStoich = stoichType === 'SGLT1'
                  ? { 'Na+': 2, 'Glucose': 1 }
                  : { 'Na+': 1, 'Glucose': 1 };
                updateTransporter(modalTransporter.id, 'stoichType', stoichType);
                updateTransporter(modalTransporter.id, 'stoich', newStoich);
              }}
              className="border rounded p-1 w-full"
            >
              <option value="SGLT1">SGLT1 (2 Na⁺ : 1 Glucose)</option>
              <option value="SGLT2">SGLT2 (1 Na⁺ : 1 Glucose)</option>
            </select>
            <div className="text-xs text-gray-600 mt-1">
              SGLT1 (intestine, late PT): 2 Na⁺:1 Glucose<br/>
              SGLT2 (early PT): 1 Na⁺:1 Glucose
            </div>
          </div>
        )}

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
        <Button variant="outline" onClick={() => {
          setTransporters(INITIAL_TRANSPORTERS.map(t => ({ ...t })));
          setIcf({ ...INITIAL_CONCENTRATIONS.icf });
          setApicalECF({ ...INITIAL_CONCENTRATIONS.apicalECF });
          setBasolateralECF({ ...INITIAL_CONCENTRATIONS.basolateralECF });
          setIsStale(true);
        }}>
          Reset
        </Button>
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
      <th className="px-2 py-1">Transporter</th>  {/* Changed from Abbr */}
      <th className="px-2 py-1">Placement</th>
      <th className="px-2 py-1">Info</th>
    </tr>
  </thead>
  <tbody>
    {[...transporters].sort((a, b) => a.name.localeCompare(b.name)).map(t => (      <tr key={t.id} className="border-t">
        <td className="px-2 py-1">{t.name}</td>
        <td className="px-2 py-1">
          <select
                value={t.placement}
                onChange={e => updateTransporter(t.id, "placement", e.target.value)}
                >
                <option value="none">None</option>
                <option value="apical">Apical</option>
                <option value="basolateral">Basolateral</option>
                {t.id === 'AQP' && <option value="both">Both</option>}
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
                <Tooltip content={<StyledTooltip />} />                <Legend />
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
                <Tooltip content={<ConcentrationTooltip />} />                <Legend />
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
                <Tooltip content={<StyledTooltip />} />
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
