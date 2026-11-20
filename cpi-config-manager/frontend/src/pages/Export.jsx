import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Select, Button, Space, Typography, Table, Tag, Radio,
  message, Alert, Statistic, Row, Col, Input, Tooltip,
  Divider, Badge, Collapse, Popconfirm
} from 'antd';import {
  ExportOutlined, ReloadOutlined, SearchOutlined,
  CheckCircleOutlined, DownloadOutlined, FolderOutlined, DeleteOutlined
} from '@ant-design/icons';
import useStore from '../store';
import { getIflows, exportConfigs, getExportFiles, getExportInventory, patchExportSettings, exportDownloadUrl, clearExportFolder } from '../api';

const { Title, Text } = Typography;
const { Option } = Select;

const fmtDate = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

export default function Export() {
  const {
    tenants, selectedTenantId, setSelectedTenantId, settings, refreshSettings, iflowsCache, setIflowsCache,
    exportRunning, exportResult, exportError, startExport, clearExport
  } = useStore();

  const [iflows, setIflows]           = useState([]);
  const [inventory, setInventory]     = useState({});
  const [loading, setLoading]         = useState(false);
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [search, setSearch]           = useState('');
  const [pkgFilter, setPkgFilter]     = useState([]);
  const [format, setFormat]           = useState('yaml');
  const [folderStructure, setFS]      = useState('per-package');
  const [exportFiles, setExportFiles] = useState(null);

  const exporting = exportRunning;
  const result    = exportResult;

  const tenant = tenants.find(t => t.id === selectedTenantId);

  // Refresh inventory + settings once export completes
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !exportRunning) {
      if (exportResult) {
        message.success(`Exported ${exportResult.exported} iflows`);
        refreshSettings();
        if (tenant?.environment) {
          getExportInventory(tenant.environment)
            .then(inv => {
              setInventory(inv);
              setIflowsCache(`${selectedTenantId}__`, { ...(iflowsCache[`${selectedTenantId}__`] || {}), exportInventory: inv });
            })
            .catch(() => {});
        }
        loadExportFiles();
      }
      if (exportError) message.error(`Export failed: ${exportError}`);
    }
    wasRunning.current = exportRunning;
  }, [exportRunning]);

  useEffect(() => {
    if (settings?.export) {
      setFormat(settings.export.format || 'yaml');
      setFS(settings.export.folderStructure || 'per-package');
    }
  }, [settings]);

  useEffect(() => {
    if (!selectedTenantId) { setIflows([]); setInventory({}); setSelectedKeys([]); return; }
    setSearch('');
    setPkgFilter([]);
    clearExport();
    loadData(selectedTenantId);
  }, [selectedTenantId]);

  const loadData = async (tenantId, force = false) => {
    const tenantObj = tenants.find(t => t.id === tenantId);
    const cacheKey = `${tenantId}__`;
    const cached = iflowsCache[cacheKey];

    if (!force && cached?.iflows?.length > 0) {
      setIflows(cached.iflows);
      if (cached.exportInventory) setInventory(cached.exportInventory);
    } else {
      setLoading(true);
      try {
        const [data, inv] = await Promise.all([
          getIflows(tenantId),
          tenantObj?.environment ? getExportInventory(tenantObj.environment).catch(() => ({})) : Promise.resolve({})
        ]);
        setIflows(data);
        setInventory(inv);
        setIflowsCache(cacheKey, { ...(cached || {}), iflows: data, exportInventory: inv });
      } catch (err) {
        message.error(`Failed to load: ${err.message}`);
      } finally {
        setLoading(false);
      }
    }

    // Always refresh inventory from disk (fast file scan)
    if (tenantObj?.environment && !force) {
      getExportInventory(tenantObj.environment)
        .then(inv => {
          setInventory(inv);
          setIflowsCache(cacheKey, { ...(iflowsCache[cacheKey] || {}), exportInventory: inv });
        })
        .catch(() => {});
    }

    loadExportFiles();
  };

  const loadExportFiles = async () => {
    try { setExportFiles(await getExportFiles()); } catch (_) {}
  };

  // Packages derived from iflows
  const packages = useMemo(() => [...new Set(iflows.map(i => i.PackageId).filter(Boolean))].sort(), [iflows]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    const q = search.toLowerCase();
    return iflows.filter(i => {
      if (pkgFilter.length > 0 && !pkgFilter.includes(i.PackageId)) return false;
      if (q && !i.Id?.toLowerCase().includes(q) && !i.Name?.toLowerCase().includes(q) && !i.PackageId?.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [iflows, search, pkgFilter]);

  const visibleKeys = filteredRows.map(i => i.Id);
  const selectedVisible = selectedKeys.filter(k => visibleKeys.includes(k));

  const handleSelectAllVisible = () => {
    setSelectedKeys(prev => {
      const merged = new Set([...prev, ...visibleKeys]);
      return [...merged];
    });
  };

  const handleClearVisible = () => {
    setSelectedKeys(prev => prev.filter(k => !visibleKeys.includes(k)));
  };

  const handleExport = () => {
    if (!selectedTenantId) return message.warning('Select a tenant first');
    const toExport = selectedKeys.length > 0 ? selectedKeys : iflows.map(i => i.Id);
    const iflowMap = new Map(iflows.map(i => [i.Id, i]));
    const selections = toExport.map(id => {
      const f = iflowMap.get(id);
      return { type: 'iflow', iflowId: id, iflowName: f?.Name, packageId: f?.PackageId };
    });
    patchExportSettings({ format, folderStructure }).catch(() => {});
    startExport({ tenantId: selectedTenantId, selections, format, folderStructure });
  };

  const handleClearExports = async () => {
    if (!tenant?.environment) return;
    try {
      const r = await clearExportFolder(tenant.environment);
      message.success(`Cleared ${r.cleared} file(s) from exports/${tenant.environment}/`);
      setInventory({});
      setIflowsCache(`${selectedTenantId}__`, { ...(iflowsCache[`${selectedTenantId}__`] || {}), exportInventory: {} });
      setExportFiles(null);
      clearExport();
      loadExportFiles();
    } catch (err) {
      message.error(`Clear failed: ${err.message}`);
    }
  };

  const exportCount = selectedKeys.length > 0 ? selectedKeys.length : iflows.length;

  const columns = [
    {
      title: 'iFlow',
      key: 'name',
      ellipsis: true,
      render: (_, r) => (
        <div>
          <Text style={{ fontSize: 13 }}>{r.Name || r.Id}</Text>
          {r.Name && r.Name !== r.Id && (
            <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>{r.Id}</Text>
          )}
        </div>
      )
    },
    {
      title: 'Package',
      dataIndex: 'PackageId',
      key: 'pkg',
      width: 180,
      ellipsis: { showTitle: false },
      render: v => <Tooltip title={v}><Tag style={{ fontSize: 11, maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', verticalAlign: 'middle' }}>{v || '—'}</Tag></Tooltip>
    },
    {
      title: 'Last Exported',
      key: 'exported',
      width: 200,
      render: (_, r) => {
        const inv = inventory[r.Id];
        if (!inv) return <Text type="secondary" style={{ fontSize: 12 }}>Never</Text>;
        return (
          <Tooltip title={inv.file}>
            <Space size={4}>
              <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 12 }} />
              <Text style={{ fontSize: 12, color: '#52c41a' }}>{fmtDate(inv.exportedAt)}</Text>
            </Space>
          </Tooltip>
        );
      }
    }
  ];

  const exportedCount = iflows.filter(i => inventory[i.Id]).length;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>Export Configuration Parameters</Title>
          <Text type="secondary">Filter, select and export iflow parameters to YAML or properties files.</Text>
        </div>
      </div>

      {/* ── Filters bar ── */}
      <div style={{ padding: '12px 16px', background: '#fafafa', borderRadius: 8, border: '1px solid #f0f0f0', marginBottom: 16 }}>
        <Space wrap size={12}>
          <div>
            <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Tenant</Text>
            <Select
              placeholder="Select tenant…"
              style={{ width: 240 }}
              value={selectedTenantId}
              onChange={v => { setSelectedTenantId(v); }}
              allowClear
            >
              {tenants.map(t => (
                <Option key={t.id} value={t.id}>
                  <Space size={4}><Tag color="blue" style={{ margin: 0 }}>{t.environment?.toUpperCase()}</Tag>{t.name}</Space>
                </Option>
              ))}
            </Select>
          </div>

          <div>
            <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Package</Text>
            <Select
              showSearch
              mode="multiple"
              allowClear
              placeholder="All packages…"
              style={{ width: 240 }}
              value={pkgFilter}
              onChange={setPkgFilter}
              disabled={!selectedTenantId || iflows.length === 0}
              filterOption={(input, option) => option.value.toLowerCase().includes(input.toLowerCase())}
              options={packages.map(p => ({ value: p, label: p }))}
              maxTagCount="responsive"
            />
          </div>

          <div>
            <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Search iFlow</Text>
            <Input
              placeholder="Name or ID…"
              prefix={<SearchOutlined />}
              style={{ width: 200 }}
              value={search}
              onChange={e => setSearch(e.target.value)}
              allowClear
              disabled={!selectedTenantId}
            />
          </div>

          {selectedTenantId && (
            <div>
              <div style={{ fontSize: 12, marginBottom: 4, visibility: 'hidden' }}>.</div>
              <Button icon={<ReloadOutlined />} onClick={() => loadData(selectedTenantId, true)} loading={loading}>
                Reload
              </Button>
            </div>
          )}
        </Space>

        {pkgFilter.length > 0 && (
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            <Text style={{ fontSize: 12, color: '#666' }}>Packages:</Text>
            {pkgFilter.map(p => (
              <Tag
                key={p}
                closable
                onClose={() => setPkgFilter(prev => prev.filter(x => x !== p))}
                style={{ fontSize: 12 }}
              >
                {p}
              </Tag>
            ))}
          </div>
        )}

        {selectedTenantId && !loading && iflows.length > 0 && (
          <div style={{ marginTop: 10, display: 'flex', gap: 20 }}>
            <Text style={{ fontSize: 12 }}><Text strong>{iflows.length}</Text> iflows total</Text>
            <Text style={{ fontSize: 12 }}><Text strong>{filteredRows.length}</Text> shown</Text>
            <Text style={{ fontSize: 12 }}>
              <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 4 }} />
              <Text strong>{exportedCount}</Text> previously exported
            </Text>
          </div>
        )}
      </div>

      {!selectedTenantId ? (
        <div style={{ textAlign: 'center', padding: 64, color: '#bbb' }}>
          <ExportOutlined style={{ fontSize: 48, display: 'block', marginBottom: 12 }} />
          <Text type="secondary">Select a tenant to view iflows</Text>
        </div>
      ) : (
        <>
          {/* ── Selection controls + Export options ── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
            <Space size={8}>
              {selectedKeys.length > 0 && (
                <Text style={{ fontSize: 13 }}>
                  <Text strong>{selectedKeys.length}</Text> selected
                  {selectedVisible.length !== selectedKeys.length && (
                    <Text type="secondary"> ({selectedVisible.length} visible)</Text>
                  )}
                </Text>
              )}
              <Button size="small" type="link" style={{ padding: 0, fontSize: 12 }} onClick={handleSelectAllVisible} disabled={filteredRows.length === 0}>
                Select visible ({filteredRows.length})
              </Button>
              {selectedKeys.length > 0 && (
                <Button size="small" type="link" style={{ padding: 0, fontSize: 12 }} onClick={() => setSelectedKeys([])}>
                  Clear all
                </Button>
              )}
            </Space>

            <Space wrap>
              {/* Export options inline */}
              <Space size={4}>
                <Text style={{ fontSize: 12 }}>Format:</Text>
                <Radio.Group size="small" value={format} onChange={e => setFormat(e.target.value)}>
                  <Radio.Button value="yaml">YAML</Radio.Button>
                  <Radio.Button value="properties">Properties</Radio.Button>
                </Radio.Group>
              </Space>
              <Space size={4}>
                <Text style={{ fontSize: 12 }}>Folders:</Text>
                <Radio.Group size="small" value={folderStructure} onChange={e => setFS(e.target.value)}>
                  <Radio.Button value="per-package">Per Package</Radio.Button>
                  <Radio.Button value="flat">Flat</Radio.Button>
                </Radio.Group>
              </Space>
              <Button
                type="primary"
                icon={<ExportOutlined />}
                onClick={handleExport}
                loading={exporting}
                disabled={!selectedTenantId}
              >
                {selectedKeys.length > 0 ? `Export Selected (${selectedKeys.length})` : `Export All (${iflows.length})`}
              </Button>
              {tenant?.environment && (
                <Tooltip title={`Download exports/${tenant.environment}/ as ZIP`}>
                  <Button
                    icon={<DownloadOutlined />}
                    href={exportDownloadUrl(tenant.environment)}
                    download
                  >
                    Download ZIP
                  </Button>
                </Tooltip>
              )}
              {tenant?.environment && (
                <Popconfirm
                  title={`Delete all files in exports/${tenant.environment}/?`}
                  description="This cannot be undone. You can re-export at any time."
                  okText="Delete"
                  okButtonProps={{ danger: true }}
                  onConfirm={handleClearExports}
                >
                  <Button danger icon={<DeleteOutlined />}>Clear Exports</Button>
                </Popconfirm>
              )}
            </Space>
          </div>

          {/* ── iFlow table ── */}
          <Table
            dataSource={filteredRows}
            columns={columns}
            rowKey="Id"
            loading={loading}
            size="small"
            pagination={{ defaultPageSize: settings?.app?.defaultPageSize || 20, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], showTotal: t => `${t} iflows` }}
            rowSelection={{
              selectedRowKeys: selectedKeys,
              onChange: setSelectedKeys
            }}
            scroll={{ x: 600 }}
          />

          {/* ── Export result ── */}
          {exporting && (
            <Alert
              type="info"
              showIcon
              style={{ marginTop: 16 }}
              message="Export running in background — you can navigate away and come back, results will be here."
            />
          )}
          {result && !exporting && (
            <div style={{ marginTop: 16 }}>
              <Alert
                type="success"
                closable
                onClose={clearExport}
                message={
                  <Space size={24}>
                    <span>Exported: <Text strong>{result.exported}</Text></span>
                    <span>Total: <Text strong>{result.total}</Text></span>
                    {result.errors > 0 && <span style={{ color: '#cf1322' }}>Errors: <Text strong>{result.errors}</Text></span>}
                    {result.outputDir && <Text type="secondary" style={{ fontSize: 12 }}>{result.outputDir}</Text>}
                  </Space>
                }
              />
            </div>
          )}

          {/* ── Export history ── */}
          {exportFiles?.envs?.length > 0 && (
            <Collapse
              size="small"
              style={{ marginTop: 16 }}
              items={[{
                key: 'history',
                label: <Space><FolderOutlined /><Text>Export History</Text><Tag>{exportFiles.envs.reduce((s, e) => s + e.files.length, 0)} files</Tag></Space>,
                children: exportFiles.envs.map(env => (
                  <div key={env.env} style={{ marginBottom: 8 }}>
                    <Space style={{ marginBottom: 4 }}>
                      <Tag color="blue">{env.env.toUpperCase()}</Tag>
                      <Text type="secondary" style={{ fontSize: 12 }}>{env.files.length} files</Text>
                    </Space>
                    <div style={{ fontSize: 12, color: '#666', maxHeight: 80, overflow: 'auto', paddingLeft: 8 }}>
                      {env.files.map(f => <div key={f}>{f}</div>)}
                    </div>
                  </div>
                ))
              }]}
            />
          )}
        </>
      )}
    </div>
  );
}
