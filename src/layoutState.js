const LAYOUT_QUERY_PARAMETER = 'layout';
const LAYOUT_VERSION = 1;

export function serializeLayoutState(state) {
  return JSON.stringify({
    v: LAYOUT_VERSION,
    transporters: (state.transporters || []).map(transporter => ({
      id: transporter.id,
      placement: transporter.placement,
      density: Number(transporter.density) || 1
    })),
    tissuePreset: state.tissuePreset,
    paracellularType: state.paracellularType,
    paraCationPerm: Number(state.paraCationPerm) || 0,
    paraAnionPerm: Number(state.paraAnionPerm) || 0,
    backgroundOsmoticPullSetting: state.backgroundOsmoticPullSetting,
    baseConcentrations: state.baseConcentrations,
    resultsView: state.resultsView
  });
}

export function parseLayoutState(search) {
  try {
    const params = new URLSearchParams(search || '');
    const raw = params.get(LAYOUT_QUERY_PARAMETER);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.v !== LAYOUT_VERSION || !Array.isArray(parsed.transporters)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function buildLayoutUrl(state, currentHref) {
  const url = new URL(currentHref);
  url.searchParams.set(LAYOUT_QUERY_PARAMETER, serializeLayoutState(state));
  url.hash = '';
  return url.toString();
}
