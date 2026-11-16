import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Select, Button, Space, Tag, Tooltip, Typography, Badge, message,
  Input, Spin, Tabs, Divider, Dropdown, Modal
} from 'antd';
import {
  ReloadOutlined, ExportOutlined, SearchOutlined,
  CloseOutlined, SyncOutlined, CheckCircleOutlined, MoreOutlined
} from '@ant-design/icons';
import useStore from '../store';
import {
  getIflows, getRuntimeStatus, getIflowConfigurations,
  exportConfigs, getExportDiff, getExportInventory, executeAction
} from '../api';

const { Title, Text } = Typography;
const { Option } = Select;

const statusColor = (s) => {
  switch (s?.toLowerCase()) {
    case 'started':  return 'success';
    case 'starting': return 'processing';
    case 'stopped':  return 'default';
    case 'error':    return 'error';
    default:         return 'default';
  }
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

// ─── Right panel ────────────────────────────────────────────────────────────

function IflowPanel({ selectedRows, tenantId, runtimeStatus, exportInventory, onClose, onExported }) {
  const [configs, setConfigs]       = useState([]);
  const [configLoading, setCL]      = useState(false);
  const [diffData, setDiffData]     = useState(null);
  const [diffLoading, setDL]        = useState(false);
  const [exporting, setExporting]   = useState(false);

  const single = selectedRows.length === 1 ? selectedRows[0] : null;

  useEffect(() => {
    if (!single) return;
    setConfigs([]);
    setDiffData(null);
    setCL(true);
    getIflowConfigurations(tenantId, single.Id)
      .then(setConfigs)
      .catch(e => message.error(`Configs: ${e.message}`))
      .finally(() => setCL(false));
  }, [single?.Id, tenantId]);

  const loadDiff = async () => {
    if (!single) return;
    setDL(true);
    try {
      setDiffData(await getExportDiff(tenantId, single.Id, single.PackageId));
    } catch (e) {
      message.error(`Compare: ${e.message}`);
    } finally {
      setDL(false);
    }
  };

  const doExport = async (rows) => {
    setExporting(true);
    try {
      const selections = rows.map(r => ({ type: 'iflow', iflowId: r.Id, iflowName: r.Name, packageId: r.PackageId }));
      const result = await exportConfigs({ tenantId, selections });
      message.success(`Exported ${result.exported} iflow(s)`);
      setDiffData(null); // stale after export
      onExported?.();
    } catch (e) {
      message.error(`Export: ${e.message}`);
    } finally {
      setExporting(false);
    }
  };

  const header = (
    <div style={{ padding: '10px 14px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
      {single ? (
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text strong style={{ fontSize: 13, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {single.Name || single.Id}
          </Text>
          <Space size={4} style={{ marginTop: 4 }}>
            {single.PackageId && <Tag style={{ fontSize: 11 }}>{single.PackageId}</Tag>}
            <Badge
              status={statusColor(runtimeStatus[single.Id]?.Status)}
              text={<Text style={{ fontSize: 11 }}>{runtimeStatus[single.Id]?.Status || 'Unknown'}</Text>}
            />
          </Space>
        </div>
      ) : (
        <Text strong>{selectedRows.length} iFlows selected</Text>
      )}
      <Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose} style={{ marginLeft: 8, flexShrink: 0 }} />
    </div>
  );

  // ── Multi-select ──
  if (selectedRows.length > 1) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {header}
        <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
          {selectedRows.map(r => {
            const inv = exportInventory[r.Id];
            return (
              <div key={r.Id} style={{ padding: '5px 0', borderBottom: '1px solid #f8f8f8' }}>
                <Text style={{ fontSize: 12 }}>{r.Name || r.Id}</Text>
                <br />
                <Space size={4}>
                  <Text type="secondary" style={{ fontSize: 11 }}>{r.PackageId}</Text>
                  {inv && <Tag color="green" style={{ fontSize: 10 }}>Exported</Tag>}
                </Space>
              </div>
            );
          })}
        </div>
        <div style={{ padding: 12, borderTop: '1px solid #f0f0f0', flexShrink: 0 }}>
          <Button type="primary" icon={<ExportOutlined />} block onClick={() => doExport(selectedRows)} loading={exporting}>
            Export Selected ({selectedRows.length})
          </Button>
        </div>
      </div>
    );
  }

  // ── Single iflow ──
  const diffCols = [
    { title: 'Key', dataIndex: 'key', key: 'k', width: 130, ellipsis: true, render: v => <Text code style={{ fontSize: 11 }}>{v}</Text> },
    {
      title: 'CPI Current', dataIndex: 'currentValue', key: 'cur', ellipsis: true,
      render: (v, r) => <Text style={{ fontSize: 12, color: r.changed ? '#ff4d4f' : undefined }} delete={r.changed && v !== null}>{v ?? '—'}</Text>
    },
    {
      title: 'Export File', dataIndex: 'exportedValue', key: 'exp', ellipsis: true,
      render: (v, r) => (
        <Space size={2}>
          <Text style={{ fontSize: 12, color: r.changed ? '#52c41a' : undefined }}>{v ?? '—'}</Text>
          {r.onlyInExport && <Tag color="blue" style={{ fontSize: 10 }}>NEW</Tag>}
        </Space>
      )
    }
  ];

  const tabItems = [
    {
      key: 'params',
      label: `Parameters${configs.length ? ` (${configs.length})` : ''}`,
      children: configLoading
        ? <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
        : configs.length === 0
          ? <Text type="secondary" style={{ display: 'block', padding: 16 }}>No configurable parameters</Text>
          : <Table dataSource={configs} size="small" rowKey="ParameterKey" pagination={false}
              columns={[
                { title: 'Key', dataIndex: 'ParameterKey', key: 'k', ellipsis: true, width: 160, render: v => <Text code style={{ fontSize: 11 }}>{v}</Text> },
                { title: 'Value', dataIndex: 'ParameterValue', key: 'v', ellipsis: true, render: v => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
                { title: 'Type', dataIndex: 'DataType', key: 't', width: 90, ellipsis: true, render: v => <Text type="secondary" style={{ fontSize: 11 }}>{v}</Text> }
              ]} />
    },
    {
      key: 'compare',
      label: 'Compare Export',
      children: diffData === null
        ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            {exportInventory[single?.Id]
              ? <Text type="secondary" style={{ display: 'block', marginBottom: 10, fontSize: 12 }}>
                  Exported {fmtDate(exportInventory[single?.Id]?.exportedAt)}
                </Text>
              : <Text type="secondary" style={{ display: 'block', marginBottom: 10, fontSize: 12 }}>No exported file found</Text>
            }
            <Button onClick={loadDiff} loading={diffLoading} icon={<SyncOutlined />}>Load Comparison</Button>
          </div>
        ) : !diffData.hasExport ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>No exported file found</Text>
            <Button type="primary" icon={<ExportOutlined />} onClick={() => doExport([single])} loading={exporting}>Export Now</Button>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', marginBottom: 4 }}>
              <Text type="secondary" style={{ fontSize: 11 }}>{diffData.file}</Text>
              {diffData.changedCount > 0
                ? <Tag color="orange">{diffData.changedCount} different</Tag>
                : <Tag color="green">In sync</Tag>}
            </div>
            <Button size="small" onClick={loadDiff} loading={diffLoading} icon={<SyncOutlined />} style={{ marginBottom: 8 }}>Refresh</Button>
            <Table dataSource={diffData.parameters} size="small" rowKey="key" pagination={false}
              rowClassName={r => r.changed ? 'diff-row-changed' : ''}
              columns={diffCols} />
          </div>
        )
    }
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {header}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 8px' }}>
        <Tabs size="small" items={tabItems} tabBarStyle={{ marginBottom: 0 }} />
      </div>
      <div style={{ padding: 12, borderTop: '1px solid #f0f0f0', flexShrink: 0 }}>
        <Button type="primary" icon={<ExportOutlined />} block onClick={() => doExport([single])} loading={exporting}>
          Export This iFlow
        </Button>
      </div>
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export default function Dashboard() {
  const {
    tenants, selectedTenantId, setSelectedTenantId, settings,
    iflowsCache, setIflowsCache, clearIflowsCache, customActions
  } = useStore();

  const [iflows, setIflows]             = useState([]);
  const [loading, setLoading]           = useState(false);
  const [runtimeStatus, setRT]          = useState({});
  const [statusLoading, setSL]          = useState(false);
  const [exportInventory, setInventory] = useState({});
  const [search, setSearch]             = useState('');
  const [pkgFilter, setPkgFilter]       = useState([]);
  const [selectedRows, setSelectedRows] = useState([]);
  const [columns, setColumns]           = useState([]);
  const fetchAbortRef                   = React.useRef(0);

  const tenant = tenants.find(t => t.id === selectedTenantId);

  useEffect(() => {
    if (settings?.dashboard?.columns) setColumns(settings.dashboard.columns);
  }, [settings]);

  // Reload inventory without re-fetching iflows (called after export from panel)
  const refreshInventory = useCallback(async () => {
    if (!tenant?.environment) return;
    try {
      const inv = await getExportInventory(tenant.environment);
      setInventory(inv);
      const cacheKey = `${selectedTenantId}__`;
      setIflowsCache(cacheKey, { ...(iflowsCache[cacheKey] || {}), exportInventory: inv });
    } catch (_) {}
  }, [tenant?.environment, selectedTenantId, iflowsCache, setIflowsCache]);

  const doFetch = useCallback(async (force = false) => {
    if (!selectedTenantId) return;
    const cacheKey = `${selectedTenantId}__`;

    if (!force && iflowsCache[cacheKey]) {
      const cached = iflowsCache[cacheKey];
      setIflows(cached.iflows);
      setRT(cached.runtimeStatus || {});
      setInventory(cached.exportInventory || {});
      return;
    }

    const callId = ++fetchAbortRef.current;
    setLoading(true);
    setIflows([]);
    setRT({});
    setInventory({});

    try {
      const data = await getIflows(selectedTenantId);
      if (callId !== fetchAbortRef.current) return;
      setIflows(data);
      setLoading(false);

      let rtResult = {};
      let invResult = {};

      const statusPromise = (async () => {
        if (data.length === 0) return;
        setSL(true);
        try {
          rtResult = await getRuntimeStatus(selectedTenantId, data.slice(0, 50).map(i => i.Id));
          if (callId !== fetchAbortRef.current) return;
          setRT(rtResult);
        } catch (_) {}
        finally { if (callId === fetchAbortRef.current) setSL(false); }
      })();

      const tenantObj = tenants.find(t => t.id === selectedTenantId);
      const invPromise = tenantObj?.environment ? (async () => {
        try {
          invResult = await getExportInventory(tenantObj.environment);
          if (callId !== fetchAbortRef.current) return;
          setInventory(invResult);
        } catch (_) {}
      })() : Promise.resolve();

      await Promise.all([statusPromise, invPromise]);

      if (callId === fetchAbortRef.current) {
        setIflowsCache(cacheKey, { iflows: data, runtimeStatus: rtResult, exportInventory: invResult });
      }
    } catch (err) {
      if (callId !== fetchAbortRef.current) return;
      message.error(`Failed to load iflows: ${err.message}`);
      setLoading(false);
    }
  }, [selectedTenantId, tenants, iflowsCache, setIflowsCache]);

  useEffect(() => { doFetch(false); }, [selectedTenantId]);

  const handleRefresh = () => {
    clearIflowsCache(selectedTenantId);
    doFetch(true);
  };

  const packages = [...new Set(iflows.map(i => i.PackageId).filter(Boolean))].sort();

  const visibleCols = columns.filter(c => c.visible) || [];

  const tableColumns = [
    ...visibleCols.map(col => {
      if (col.key === 'Status') {
        return {
          title: col.label, key: 'Status', width: col.width || 120,
          render: (_, r) => {
            const s = runtimeStatus[r.Id]?.Status;
            if (statusLoading && !runtimeStatus[r.Id]) return <Spin size="small" />;
            return <Badge status={statusColor(s)} text={s || '—'} />;
          }
        };
      }
      if (col.custom) {
        return {
          title: col.label, key: col.key, width: col.width || 150, ellipsis: true,
          render: (_, r) => col.sourceType === 'fixed' ? col.fixedValue || '—' : r[col.fieldPath] || '—'
        };
      }
      return { title: col.label, dataIndex: col.key, key: col.key, width: col.width, ellipsis: { showTitle: false }, render: v => <Tooltip title={v}><span>{v || '—'}</span></Tooltip> };
    }),
    {
      title: 'Export Status',
      key: '_exportStatus',
      width: 150,
      render: (_, r) => {
        const inv = exportInventory[r.Id];
        if (!inv) return <Text type="secondary" style={{ fontSize: 12 }}>—</Text>;
        return (
          <Tooltip title={`${inv.file} · ${inv.paramCount} param(s)`}>
            <Space size={4}>
              <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 12 }} />
              <Text style={{ fontSize: 12, color: '#52c41a' }}>{fmtDate(inv.exportedAt)}</Text>
            </Space>
          </Tooltip>
        );
      }
    },
    {
      title: 'Actions', key: 'actions', width: 80, fixed: 'right',
      render: (_, r) => {
        const dashActions = (customActions || []).filter(a => a.enabled && (a.showIn || []).includes('dashboard'));

        const doExportRow = async (e) => {
          e?.domEvent?.stopPropagation?.();
          e?.stopPropagation?.();
          try {
            const res = await exportConfigs({ tenantId: selectedTenantId, selections: [{ type: 'iflow', iflowId: r.Id, iflowName: r.Name, packageId: r.PackageId }] });
            message.success(`Exported to ${res.outputDir}`);
            refreshInventory();
          } catch (err) { message.error(err.message); }
        };

        const doCustomAction = async (action) => {
          const run = async () => {
            try {
              const res = await executeAction(selectedTenantId, r.Id, action.id);
              message.success(`${action.name}: ${res.status === 202 ? 'Accepted' : 'Done'}`);
            } catch (err) {
              message.error(`${action.name}: ${err.message}`);
            }
          };
          if (action.confirmRequired) {
            Modal.confirm({
              title: `Run "${action.name}"?`,
              content: `This will execute "${action.name}" on iflow: ${r.Name || r.Id}`,
              okText: 'Run',
              onOk: run
            });
          } else {
            await run();
          }
        };

        if (dashActions.length === 0) {
          return (
            <Button size="small" icon={<ExportOutlined />}
              onClick={doExportRow}
              title="Export"
            />
          );
        }

        const menuItems = [
          {
            key: '__export',
            icon: <ExportOutlined />,
            label: 'Export',
            onClick: doExportRow
          },
          { type: 'divider' },
          ...dashActions.map(a => ({
            key: a.id,
            label: a.label || a.name,
            onClick: ({ domEvent }) => { domEvent.stopPropagation(); doCustomAction(a); }
          }))
        ];

        return (
          <Dropdown menu={{ items: menuItems }} trigger={['click']} onClick={e => e.stopPropagation()}>
            <Button size="small" icon={<MoreOutlined />} />
          </Dropdown>
        );
      }
    }
  ];

  const filtered = iflows.filter(i => {
    const q = search.toLowerCase();
    if (pkgFilter.length > 0 && !pkgFilter.includes(i.PackageId)) return false;
    return !q || i.Id?.toLowerCase().includes(q) || i.Name?.toLowerCase().includes(q) || i.PackageId?.toLowerCase().includes(q);
  });

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* ── Main table area ── */}
      <div style={{ flex: 1, minWidth: 0, padding: 24, overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <Title level={4} style={{ margin: 0 }}>Integration Flows Dashboard</Title>
            {tenant && <Text type="secondary" style={{ fontSize: 12 }}>{tenant.name} — {tenant.environment?.toUpperCase()}</Text>}
          </div>
          <Space wrap>
            <Select placeholder="Select Tenant" style={{ width: 220 }} value={selectedTenantId} onChange={v => { setSelectedTenantId(v); setSelectedRows([]); }} allowClear>
              {tenants.map(t => (
                <Option key={t.id} value={t.id}>
                  <Space><Tag color="blue" style={{ margin: 0 }}>{t.environment?.toUpperCase()}</Tag>{t.name}</Space>
                </Option>
              ))}
            </Select>
            <Select
              showSearch
              mode="multiple"
              allowClear
              placeholder="All packages…"
              style={{ width: 220 }}
              value={pkgFilter}
              onChange={setPkgFilter}
              disabled={!selectedTenantId}
              filterOption={(input, option) => option.value.toLowerCase().includes(input.toLowerCase())}
              options={packages.map(p => ({ value: p, label: p }))}
              maxTagCount="responsive"
            />
            <Input placeholder="Search iFlow…" prefix={<SearchOutlined />} style={{ width: 180 }} value={search} onChange={e => setSearch(e.target.value)} allowClear />
            <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={loading}>Refresh</Button>
          </Space>
        </div>

        {!selectedTenantId ? (
          <div style={{ textAlign: 'center', padding: 48, color: '#999' }}>Select a tenant to view integration flows</div>
        ) : (
          <Table
            dataSource={filtered}
            columns={tableColumns}
            rowKey="Id"
            loading={loading}
            size="small"
            scroll={{ x: 'max-content' }}
            rowSelection={{
              selectedRowKeys: selectedRows.map(r => r.Id),
              onChange: (_, rows) => setSelectedRows(rows)
            }}
            onRow={record => ({
              style: { cursor: 'pointer' },
              onClick: (e) => {
                if (e.target.closest('td.ant-table-selection-column')) return;
                setSelectedRows(prev => prev.length === 1 && prev[0].Id === record.Id ? [] : [record]);
              }
            })}
            pagination={{ defaultPageSize: settings?.app?.defaultPageSize || 20, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], showTotal: t => `${t} iflows` }}
          />
        )}
      </div>

      {/* ── Right panel ── */}
      {selectedRows.length > 0 && (
        <div style={{ width: 420, flexShrink: 0, borderLeft: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <IflowPanel
            selectedRows={selectedRows}
            tenantId={selectedTenantId}
            runtimeStatus={runtimeStatus}
            exportInventory={exportInventory}
            onClose={() => setSelectedRows([])}
            onExported={refreshInventory}
          />
        </div>
      )}
    </div>
  );
}
