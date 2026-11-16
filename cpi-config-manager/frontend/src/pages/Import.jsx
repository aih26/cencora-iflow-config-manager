import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Select, Button, Space, Typography, Table, Tag, Alert,
  message, Divider, Collapse, Checkbox,
  Modal, Spin, Tooltip, Upload
} from 'antd';
import {
  SyncOutlined, RocketOutlined, ReloadOutlined,
  CheckCircleOutlined, FolderOutlined,
  ImportOutlined, UploadOutlined, InboxOutlined
} from '@ant-design/icons';
import useStore from '../store';
import {
  getIflows, previewImport, deployIflows,
  getImportInventory, uploadImportFiles
} from '../api';

const { Title, Text } = Typography;
const { Option } = Select;

export default function Import() {
  const {
    tenants, iflowsCache, setIflowsCache, clearIflowsCache, settings,
    importRunning, importResult, importError, startApply, clearImport
  } = useStore();

  const importBaseDir = settings?.import?.baseDir || 'imports';

  const [targetTenantId, setTargetTenantId] = useState(null);
  const [env, setEnv]                       = useState(null);
  const sourceFolder = 'imports';
  const [iflows, setIflows]                 = useState([]);
  const [iflowsLoading, setIflowsLoading]   = useState(false);
  const [inventory, setInventory]           = useState({});
  const [inventoryLoading, setInvLoading]   = useState(false);
  const [selectedKeys, setSelectedKeys]     = useState([]);
  const [diffs, setDiffs]                   = useState([]);
  const [diffLoading, setDiffLoading]       = useState(false);
  const [deploying, setDeploying]           = useState(false);
  const [onlyChanged, setOnlyChanged]       = useState(true);
  const [uploadFileList, setUploadFileList] = useState([]);
  const [uploading, setUploading]           = useState(false);
  const [changedFilter, setChangedFilter]   = useState(false);

  const applying    = importRunning;
  const applyResult = importResult;

  // Refresh inventory after apply completes
  const wasApplying = useRef(false);
  useEffect(() => {
    if (wasApplying.current && !importRunning) {
      if (importResult) {
        const updated = importResult.results?.filter(r => r.updated > 0).length ?? 0;
        if (importResult.errors > 0) {
          message.warning(`${importResult.updated} params updated, ${importResult.errors} iflow(s) had errors`);
        } else {
          message.success(`Updated ${importResult.updated} parameters across ${updated} iflow${updated !== 1 ? 's' : ''}`);
        }
        if (env) loadInventory(env);
      }
      if (importError) message.error(`Apply failed: ${importError}`);
    }
    wasApplying.current = importRunning;
  }, [importRunning]);

  const tenant = tenants.find(t => t.id === targetTenantId);

  // When tenant changes: auto-detect env, load iflows + inventory in parallel
  useEffect(() => {
    if (!targetTenantId) return;
    const detectedEnv = tenant?.environment || 'dev';
    setEnv(detectedEnv);
    setDiffs([]);
    setApplyResult(null);
    loadIflows(targetTenantId);
    loadInventory(detectedEnv);
  }, [targetTenantId]);

  // Re-scan when env changes
  useEffect(() => {
    if (env) loadInventory(env);
  }, [env]);

  const loadIflows = async (tenantId) => {
    const cacheKey = `${tenantId}__`;
    if (iflowsCache[cacheKey]?.iflows) {
      setIflows(iflowsCache[cacheKey].iflows);
      return;
    }
    setIflowsLoading(true);
    try {
      const data = await getIflows(tenantId);
      setIflows(data);
      setIflowsCache(cacheKey, { ...(iflowsCache[cacheKey] || {}), iflows: data });
    } catch (e) {
      message.error(`Failed to load iflows: ${e.message}`);
    } finally {
      setIflowsLoading(false);
    }
  };

  const loadInventory = async (envName) => {
    if (!envName) return;
    setInvLoading(true);
    try {
      const inv = await getImportInventory(envName);
      setInventory(inv);
      // Pre-select iflows that have a file
      setSelectedKeys(Object.keys(inv));
    } catch (_) {
      setInventory({});
      setSelectedKeys([]);
    } finally {
      setInvLoading(false);
    }
  };

  // Merged table data: all iflows + any file-only entries not in CPI list
  const tableData = useMemo(() => {
    const iflowMap = new Map(iflows.map(i => [i.Id, i]));
    const rows = iflows.map(i => ({
      key: i.Id,
      iflowId: i.Id,
      name: i.Name || i.Id,
      packageId: i.PackageId,
      hasFile: !!inventory[i.Id],
      file: inventory[i.Id]?.file,
      paramCount: inventory[i.Id]?.paramCount,
      exportedAt: inventory[i.Id]?.exportedAt
    }));

    // Append file-only entries (files for iflows not in current CPI list)
    for (const [iflowId, info] of Object.entries(inventory)) {
      if (!iflowMap.has(iflowId)) {
        rows.push({
          key: iflowId,
          iflowId,
          name: info.iflowName || iflowId,
          packageId: info.packageId,
          hasFile: true,
          file: info.file,
          paramCount: info.paramCount,
          exportedAt: info.exportedAt,
          fileOnly: true
        });
      }
    }

    return rows;
  }, [iflows, inventory]);

  const rowsWithFiles = tableData.filter(r => r.hasFile);
  const selectedWithFiles = selectedKeys.filter(k => inventory[k]);

  const handlePreview = async () => {
    if (!targetTenantId) return message.warning('Select a target tenant');
    if (selectedWithFiles.length === 0) return message.warning('No iflows with files selected');
    setDiffLoading(true);
    setDiffs([]);
    setApplyResult(null);
    setChangedFilter(false);
    try {
      const data = await previewImport({
        tenantId: targetTenantId,
        env,
        sourceFolder,
        iflowIds: selectedWithFiles
      });
      setDiffs(data);
      // Auto-filter table to iflows with detected changes
      const changedIds = data.filter(d => d.changedCount > 0 && !d.error).map(d => d.iflowId);
      if (changedIds.length > 0) {
        setChangedFilter(true);
        setSelectedKeys(changedIds);
      }
    } catch (err) {
      message.error(`Preview failed: ${err.message}`);
    } finally {
      setDiffLoading(false);
    }
  };

  const handleApply = () => {
    if (!targetTenantId || diffs.length === 0) return;
    startApply({ tenantId: targetTenantId, env, sourceFolder, iflowIds: selectedWithFiles, onlyChanged });
  };

  const handleUpload = async () => {
    if (!env) return message.warning('Select an environment first');
    if (uploadFileList.length === 0) return message.warning('No files selected');
    setUploading(true);
    try {
      const result = await uploadImportFiles(env, uploadFileList.map(f => f.originFileObj));
      message.success(`Uploaded ${result.saved} file(s) to imports/${env}/`);
      setUploadFileList([]);
      loadInventory(env);
    } catch (err) {
      message.error(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDeploy = async () => {    if (!targetTenantId || selectedWithFiles.length === 0) return;
    Modal.confirm({
      title: 'Deploy iFlows',
      content: `Deploy ${selectedWithFiles.length} iflow(s) to ${tenant?.name}?`,
      okText: 'Deploy',
      onOk: async () => {
        setDeploying(true);
        try {
          await deployIflows(targetTenantId, selectedWithFiles);
          message.success(`Deploy triggered for ${selectedWithFiles.length} iflows`);
        } catch (err) {
          message.error(`Deploy failed: ${err.message}`);
        } finally {
          setDeploying(false);
        }
      }
    });
  };

  const fileCount = Object.keys(inventory).length;
  const matchedCount = iflows.filter(i => inventory[i.Id]).length;

  const iflowColumns = [
    {
      title: 'iFlow',
      key: 'name',
      ellipsis: true,
      render: (_, r) => (
        <Space size={4}>
          <Text style={{ fontSize: 13 }}>{r.name}</Text>
          {r.fileOnly && <Tag color="orange" style={{ fontSize: 10 }}>file only</Tag>}
        </Space>
      )
    },
    { title: 'Package', dataIndex: 'packageId', key: 'pkg', width: 160, ellipsis: { showTitle: false },
      render: v => <Tooltip title={v}><Text type="secondary" style={{ fontSize: 12 }}>{v || '—'}</Text></Tooltip> },
    {
      title: 'Import File',
      key: 'file',
      width: 240,
      render: (_, r) => r.hasFile
        ? (
          <Tooltip title={r.file}>
            <Space size={4}>
              <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 12 }} />
              <Text style={{ fontSize: 12, color: '#52c41a', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>
                {r.file}
              </Text>
              {r.paramCount != null && <Tag style={{ fontSize: 10 }}>{r.paramCount}p</Tag>}
            </Space>
          </Tooltip>
        )
        : <Text type="secondary" style={{ fontSize: 12 }}>No file</Text>
    }
  ];

  const diffCols = [
    { title: 'Key', dataIndex: 'key', key: 'k', width: 220, ellipsis: true,
      render: v => <Text code style={{ fontSize: 11 }}>{v}</Text> },
    { title: 'Current', dataIndex: 'currentValue', key: 'cur', ellipsis: true,
      render: (v, r) => <Text style={{ fontSize: 12, color: r.changed ? '#ff4d4f' : undefined }} delete={r.changed && v !== null}>{v ?? '—'}</Text> },
    { title: 'New Value', dataIndex: 'newValue', key: 'new', ellipsis: true,
      render: (v, r) => (
        <Space size={4}>
          <Text style={{ fontSize: 12, color: r.changed || r.isNew ? '#52c41a' : undefined }}>{v}</Text>
          {r.isNew && <Tag color="blue" style={{ fontSize: 10 }}>NEW</Tag>}
        </Space>
      ) }
  ];

  const changedDiffs = diffs.filter(d => d.changedCount > 0 && !d.error);
  const changedIflowIds = new Set(changedDiffs.map(d => d.iflowId));
  const displayedTableData = changedFilter ? tableData.filter(r => changedIflowIds.has(r.key)) : tableData;

  return (
    <div style={{ padding: 24 }}>
      <Title level={4} style={{ marginBottom: 4 }}>Import & Update Configuration</Title>
      <Text type="secondary">Select a tenant to see available iflows and matching config files in the folder.</Text>

      {/* ── Config bar ── */}
      <div style={{ marginTop: 16, padding: '12px 16px', background: '#fafafa', borderRadius: 8, border: '1px solid #f0f0f0' }}>
        <Space wrap size={16}>
          <div>
            <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Target Tenant</Text>
            <Select
              placeholder="Select tenant…"
              style={{ width: 240 }}
              value={targetTenantId}
              onChange={v => { setTargetTenantId(v); setIflows([]); setInventory({}); setSelectedKeys([]); setDiffs([]); }}
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
            <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Environment Folder</Text>
            <Select
              placeholder="Auto-detect from tenant"
              style={{ width: 140 }}
              value={env}
              onChange={setEnv}
              allowClear
              disabled={!targetTenantId}
            >
              {[...new Set(tenants.map(t => t.environment).filter(Boolean))].map(e => (
                <Option key={e} value={e}>{e}</Option>
              ))}
            </Select>
          </div>

          {targetTenantId && (
            <div style={{ alignSelf: 'flex-end' }}>
              <Button icon={<ReloadOutlined />} onClick={() => { clearIflowsCache(targetTenantId); loadIflows(targetTenantId); loadInventory(env); }} loading={iflowsLoading || inventoryLoading}>
                Rescan
              </Button>
            </div>
          )}
        </Space>

        {targetTenantId && (
          <div style={{ marginTop: 12, display: 'flex', gap: 24 }}>
            <Space size={4}>
              <FolderOutlined style={{ color: '#1677ff' }} />
              <Text style={{ fontSize: 12 }}>
                {inventoryLoading ? <Spin size="small" /> : <><Text strong>{fileCount}</Text> files found in <Text code style={{ fontSize: 11 }}>{importBaseDir}/{env}/</Text></>}
              </Text>
            </Space>
            {!iflowsLoading && iflows.length > 0 && (
              <Space size={4}>
                <CheckCircleOutlined style={{ color: '#52c41a' }} />
                <Text style={{ fontSize: 12 }}><Text strong>{matchedCount}</Text> of {iflows.length} iflows matched</Text>
              </Space>
            )}
          </div>
        )}
      </div>

      {!targetTenantId ? (
        <div style={{ textAlign: 'center', padding: 64, color: '#bbb' }}>
          <ImportOutlined style={{ fontSize: 48, display: 'block', marginBottom: 12 }} />
          <Text type="secondary">Select a target tenant to get started</Text>
        </div>
      ) : (
        <>
          {/* ── Upload Config Files ── */}
          <div style={{ marginTop: 16, padding: '16px', background: '#fafafa', borderRadius: 8, border: '1px solid #f0f0f0' }}>
            <Title level={5} style={{ margin: '0 0 4px' }}>Upload Config Files to Import Directory</Title>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Upload YAML / .properties files or a ZIP into the <Text code>{importBaseDir}/{env || '<env>'}/</Text> folder, then select iFlows below to preview and apply.
            </Text>
            <div style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <Upload.Dragger
                multiple
                accept=".yaml,.yml,.properties,.zip"
                fileList={uploadFileList}
                onChange={({ fileList }) => setUploadFileList(fileList)}
                beforeUpload={() => false}
                style={{ flex: 1, minWidth: 220 }}
              >
                <p className="ant-upload-drag-icon" style={{ margin: '8px 0 4px' }}><InboxOutlined style={{ fontSize: 24 }} /></p>
                <p className="ant-upload-text" style={{ fontSize: 13, margin: '0 0 4px' }}>Click or drag files here</p>
                <p className="ant-upload-hint" style={{ fontSize: 11, margin: 0 }}>
                  YAML / .properties or ZIP archive. ZIP contents are extracted automatically.
                </p>
              </Upload.Dragger>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 160 }}>
                <div>
                  <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Upload to env</Text>
                  <Select
                    placeholder="Environment…"
                    style={{ width: '100%' }}
                    value={env}
                    onChange={setEnv}
                  >
                    {[...new Set(tenants.map(t => t.environment).filter(Boolean))].map(e => (
                      <Option key={e} value={e}>{e}</Option>
                    ))}
                  </Select>
                </div>
                <Button
                  type="primary"
                  icon={<UploadOutlined />}
                  onClick={handleUpload}
                  loading={uploading}
                  disabled={uploadFileList.length === 0 || !env}
                  block
                >
                  Upload ({uploadFileList.length})
                </Button>
              </div>
            </div>
          </div>

          {/* ── iFlow table ── */}
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Space size={8}>
                <Text strong>iFlows</Text>
                {changedFilter && (
                  <>
                    <Tag color="orange">{changedIflowIds.size} with changes</Tag>
                    <Button
                      size="small"
                      type="link"
                      style={{ padding: 0, fontSize: 12 }}
                      onClick={() => { setChangedFilter(false); setSelectedKeys(rowsWithFiles.map(r => r.key)); }}
                    >
                      Clear Filter
                    </Button>
                  </>
                )}
                {!changedFilter && rowsWithFiles.length > 0 && (
                  <Button
                    size="small"
                    type="link"
                    style={{ padding: 0, fontSize: 12 }}
                    onClick={() => setSelectedKeys(rowsWithFiles.map(r => r.key))}
                  >
                    Select all with files ({rowsWithFiles.length})
                  </Button>
                )}
                {selectedKeys.length > 0 && (
                  <Button size="small" type="link" style={{ padding: 0, fontSize: 12 }} onClick={() => setSelectedKeys([])}>
                    Clear
                  </Button>
                )}
              </Space>
              <Space>
                <Checkbox checked={onlyChanged} onChange={e => setOnlyChanged(e.target.checked)}>
                  Only update changed values
                </Checkbox>
                <Button
                  type="primary"
                  icon={<SyncOutlined />}
                  onClick={handlePreview}
                  loading={diffLoading}
                  disabled={selectedWithFiles.length === 0}
                >
                  Preview Changes ({selectedWithFiles.length})
                </Button>
              </Space>
            </div>

            <Table
              dataSource={displayedTableData}
              columns={iflowColumns}
              rowKey="key"
              loading={iflowsLoading || inventoryLoading}
              size="small"
              pagination={{ defaultPageSize: settings?.app?.defaultPageSize || 20, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], showTotal: t => `${t} iflows` }}
              rowSelection={{
                selectedRowKeys: selectedKeys,
                onChange: setSelectedKeys,
                getCheckboxProps: r => ({ disabled: !r.hasFile })
              }}
              rowClassName={r => r.hasFile ? '' : 'ant-table-row-disabled-light'}
              scroll={{ x: 680 }}
            />
          </div>

          {/* ── Diff results ── */}
          {(diffLoading || diffs.length > 0) && (
            <div style={{ marginTop: 24 }}>
              <Divider style={{ margin: '12px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Space>
                  <Text strong>Configuration Diff</Text>
                  {diffs.length > 0 && (
                    <Tag color={changedDiffs.length > 0 ? 'orange' : 'green'}>
                      {changedDiffs.length} iflow{changedDiffs.length !== 1 ? 's' : ''} with changes
                    </Tag>
                  )}
                </Space>
                <Space>
                  <Button
                    icon={<SyncOutlined />}
                    onClick={handleApply}
                    loading={applying}
                    disabled={changedDiffs.length === 0}
                  >
                    Apply Updates ({changedDiffs.length})
                  </Button>
                  <Button
                    icon={<RocketOutlined />}
                    onClick={handleDeploy}
                    loading={deploying}
                    disabled={selectedWithFiles.length === 0}
                  >
                    Deploy ({selectedWithFiles.length})
                  </Button>
                </Space>
              </div>

              {applying && (
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 12 }}
                  message="Apply running in background — you can navigate away and come back, results will be here."
                />
              )}
              {applyResult && !applying && (
                <Alert
                  type={applyResult.errors > 0 ? (applyResult.updated > 0 ? 'warning' : 'error') : 'success'}
                  style={{ marginBottom: 12 }}
                  closable
                  onClose={clearImport}
                  message={(() => {
                    const updatedIflows = applyResult.results?.filter(r => r.updated > 0).length ?? 0;
                    return `Applied: ${applyResult.updated} param${applyResult.updated !== 1 ? 's' : ''} updated across ${updatedIflows} iflow${updatedIflows !== 1 ? 's' : ''}${applyResult.errors > 0 ? ` — ${applyResult.errors} error(s)` : ''}`;
                  })()}
                  description={
                    applyResult.errors > 0 && applyResult.results ? (
                      <ul style={{ margin: '4px 0 0', paddingLeft: 16, fontSize: 12 }}>
                        {applyResult.results.filter(r => r.error || r.errors > 0).map((r, i) => (
                          <li key={i} style={{ color: '#cf1322' }}>
                            <strong>{r.iflowId || r.file}</strong>
                            {r.error && `: ${r.error}`}
                            {r.errors > 0 && r.details && `: ${r.details.filter(d => d.status === 'error').map(d => `${d.key} — ${d.error}`).join('; ')}`}
                          </li>
                        ))}
                      </ul>
                    ) : null
                  }
                />
              )}

              {diffs.filter(d => d.error).map(d => (
                <Alert key={d.file || d.iflowId} type="error" closable
                  message={`${d.iflowId || d.file}: ${d.error}`}
                  style={{ marginBottom: 8 }} />
              ))}

              {diffLoading
                ? <div style={{ textAlign: 'center', padding: 32 }}><Spin /></div>
                : (
                  <Collapse
                    items={diffs.filter(d => !d.error).map(d => ({
                      key: d.iflowId,
                      label: (
                        <Space>
                          <Text strong style={{ fontSize: 13 }}>{d.iflowId}</Text>
                          {d.packageId && <Tag style={{ fontSize: 11 }}>{d.packageId}</Tag>}
                          {d.changedCount > 0
                            ? <Tag color="orange">{d.changedCount} changes</Tag>
                            : <Tag color="green">No changes</Tag>}
                        </Space>
                      ),
                      children: (
                        <Table
                          dataSource={d.parameters}
                          columns={diffCols}
                          rowKey="key"
                          size="small"
                          pagination={false}
                          rowClassName={r => r.changed || r.isNew ? 'diff-row-changed' : ''}
                        />
                      )
                    }))}
                  />
                )
              }
            </div>
          )}
        </>
      )}
    </div>
  );
}
