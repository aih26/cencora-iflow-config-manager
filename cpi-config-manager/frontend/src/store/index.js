import { create } from 'zustand';
import { getSettings, getTenants, getEnvironments, getCustomActions, compareEnvs, exportConfigs, applyImport } from '../api';

const useStore = create((set, get) => ({
  settings: null,
  tenants: [],
  environments: [],
  customActions: [],
  selectedTenantId: null,
  loading: false,
  iflowsCache: {},

  // ── Compare state (persists across navigation) ──────────────────────────────
  compareSourceTenantId: null,
  compareTargetTenantId: null,
  compareRunning: false,
  compareResults: null,
  compareError: null,

  setCompareSourceTenantId: (id) => set({ compareSourceTenantId: id, compareResults: null, compareError: null }),
  setCompareTargetTenantId: (id) => set({ compareTargetTenantId: id, compareResults: null, compareError: null }),

  startCompare: async () => {
    const { compareSourceTenantId, compareTargetTenantId } = get();
    if (!compareSourceTenantId || !compareTargetTenantId) return;
    set({ compareRunning: true, compareResults: null, compareError: null });
    try {
      const data = await compareEnvs({ sourceTenantId: compareSourceTenantId, targetTenantId: compareTargetTenantId });
      set({ compareRunning: false, compareResults: data });
    } catch (err) {
      set({ compareRunning: false, compareError: err.message });
    }
  },

  clearCompare: () => set({ compareResults: null, compareError: null, compareRunning: false }),

  // ── Export state (persists across navigation) ────────────────────────────────
  exportRunning: false,
  exportResult: null,
  exportError: null,

  startExport: async (params) => {
    set({ exportRunning: true, exportResult: null, exportError: null });
    try {
      const res = await exportConfigs(params);
      set({ exportRunning: false, exportResult: res });
    } catch (err) {
      set({ exportRunning: false, exportError: err.message });
    }
  },

  clearExport: () => set({ exportResult: null, exportError: null }),

  // ── Import/Apply state (persists across navigation) ──────────────────────────
  importRunning: false,
  importResult: null,
  importError: null,

  startApply: async (params) => {
    set({ importRunning: true, importResult: null, importError: null });
    try {
      const res = await applyImport(params);
      set({ importRunning: false, importResult: res });
    } catch (err) {
      set({ importRunning: false, importError: err.message });
    }
  },

  clearImport: () => set({ importResult: null, importError: null }),
  // ────────────────────────────────────────────────────────────────────────────

  init: async () => {
    set({ loading: true });
    try {
      const [settings, tenants, environments, customActions] = await Promise.all([
        getSettings(),
        getTenants(),
        getEnvironments(),
        getCustomActions()
      ]);
      set({ settings, tenants, environments, customActions, loading: false });
    } catch (e) {
      console.error('Init failed:', e);
      set({ loading: false });
    }
  },

  setSettings: (settings) => set({ settings }),
  setTenants: (tenants) => set({ tenants }),
  setEnvironments: (environments) => set({ environments }),
  setSelectedTenantId: (id) => set({ selectedTenantId: id }),

  getSelectedTenant: () => {
    const { tenants, selectedTenantId } = get();
    return tenants.find(t => t.id === selectedTenantId) || null;
  },

  setIflowsCache: (key, data) => set(state => ({
    iflowsCache: { ...state.iflowsCache, [key]: data }
  })),

  clearIflowsCache: (tenantId) => set(state => {
    const next = { ...state.iflowsCache };
    // Remove all cache keys that start with this tenantId
    Object.keys(next).forEach(k => {
      if (k.startsWith(tenantId + '__')) delete next[k];
    });
    return { iflowsCache: next };
  }),

  refreshTenants: async () => {
    const tenants = await getTenants();
    set({ tenants });
    return tenants;
  },

  refreshSettings: async () => {
    const settings = await getSettings();
    set({ settings });
    return settings;
  },

  refreshEnvironments: async () => {
    const environments = await getEnvironments();
    set({ environments });
    return environments;
  },

  refreshCustomActions: async () => {
    const customActions = await getCustomActions();
    set({ customActions });
    return customActions;
  }
}));

export default useStore;
