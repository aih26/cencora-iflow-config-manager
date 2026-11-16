import React, { useState, useMemo } from 'react';
import {
  Select, Button, Space, Typography, Table, Tag, Alert,
  message, Statistic, Row, Col, Input, Badge, Tooltip,
  Dropdown
} from 'antd';
import {
  SyncOutlined, DownloadOutlined, SearchOutlined,
  CheckCircleOutlined, WarningOutlined, CloseCircleOutlined,
  MinusCircleOutlined, SwapOutlined, PlusOutlined
} from '@ant-design/icons';
import useStore from '../store';

const { Title, Text } = Typography;
const { Option } = Select;

const STATUS_META = {
  same:               { color: 'success',   label: 'Identical',          icon: <CheckCircleOutlined /> },
  different:          { color: 'warning',   label: 'Different',          icon: <WarningOutlined /> },
  'missing-in-target':{ color: 'error',     label: 'Only in Source',     icon: <MinusCircleOutlined /> },
  'missing-in-source':{ color: 'default',   label: 'Only in Target',     icon: <MinusCircleOutlined /> },
  error:              { color: 'error',     label: 'Error',              icon: <CloseCircleOutlined /> }
};

// ── Report download helpers ─────────────────────────────────────────────────

const toCSV = (rows) => {
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['iFlow ID','iFlow Name','Package','iFlow Status','Diff Count','Parameter Key','Source Value','Target Value','Param Status'];
  const lines = [header.map(esc).join(',')];
  for (const r of rows) {
    if (r.parameters?.length) {
      for (const p of r.parameters) {
        lines.push([r.iflowId, r.iflowName||r.iflowId, r.packageId||'', r.status, r.diffCount||0, p.key, p.sourceValue??'', p.targetValue??'', p.status].map(esc).join(','));
      }
    } else {
      lines.push([r.iflowId, r.iflowName||r.iflowId, r.packageId||'', r.status, 0, '', '', '', ''].map(esc).join(','));
    }
  }
  return lines.join('\n');
};

const downloadFile = (content, filename, type) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// ── Component ───────────────────────────────────────────────────────────────

export default function Compare() {
  const {
    tenants, settings,
    compareSourceTenantId, compareTargetTenantId,
    compareRunning, compareResults, compareError,
    setCompareSourceTenantId, setCompareTargetTenantId,
    startCompare, clearCompare
  } = useStore();

  const [search, setSearch]         = useState('');
  const [pkgFilter, setPkgFilter]   = useState([]);
  const [statusFilter, setStatusFilter] = useState(null);
  const [expandedRows, setExpandedRows] = useState([]);

  const sourceTenantId = compareSourceTenantId;
  const targetTenantId = compareTargetTenantId;
  const comparing      = compareRunning;
  const results        = compareResults;

  const sourceTenant = tenants.find(t => t.id === sourceTenantId);
  const targetTenant = tenants.find(t => t.id === targetTenantId);

  const handleCompare = () => {
    if (!sourceTenantId || !targetTenantId) return message.warning('Select both tenants');
    if (sourceTenantId === targetTenantId) return message.warning('Select two different tenants');
    setExpandedRows([]);
    startCompare();
  };

  // Show error from store if any
  React.useEffect(() => {
    if (compareError) message.error(`Compare failed: ${compareError}`);
  }, [compareError]);

  const packages = useMemo(() => {
    if (!results) return [];
    return [...new Set(results.results.map(r => r.packageId).filter(Boolean))].sort();
  }, [results]);

  const filteredRows = useMemo(() => {
    if (!results) return [];
    const q = search.toLowerCase();
    return results.results.filter(r => {
      if (pkgFilter.length > 0 && !pkgFilter.includes(r.packageId)) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      if (q && !r.iflowId?.toLowerCase().includes(q) && !r.iflowName?.toLowerCase().includes(q) && !r.packageId?.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [results, search, pkgFilter, statusFilter]);

  const handleDownload = (format) => {
    if (!results) return;
    const ts = new Date().toISOString().slice(0,16).replace(/[T:]/g,'-');
    const srcEnv = sourceTenant?.environment || sourceTenant?.name || 'source';
    const tgtEnv = targetTenant?.environment || targetTenant?.name || 'target';
    const filename = `compare-${srcEnv}-vs-${tgtEnv}-${ts}`;

    if (format === 'csv') {
      downloadFile(toCSV(filteredRows), `${filename}.csv`, 'text/csv');
    } else {
      // HTML report
      const htmlRows = filteredRows.map(r => {
        const rowBg = r.status === 'same' ? '#f6ffed' : r.status === 'different' ? '#fffbe6' : '#fff2f0';
        const paramRows = (r.parameters || []).map(p =>
          `<tr style="background:${p.status==='same'?'':'#fffbe6'}">
            <td style="padding:2px 8px;font-family:monospace;font-size:12px">${p.key}</td>
            <td style="padding:2px 8px;font-size:12px">${p.sourceValue??'—'}</td>
            <td style="padding:2px 8px;font-size:12px">${p.targetValue??'—'}</td>
            <td style="padding:2px 8px;font-size:11px;color:${p.status==='same'?'green':'orange'}">${p.status}</td>
          </tr>`
        ).join('');
        return `<tr style="background:${rowBg}">
          <td style="padding:6px 8px;font-weight:600">${r.iflowId}</td>
          <td style="padding:6px 8px">${r.iflowName||''}</td>
          <td style="padding:6px 8px">${r.packageId||''}</td>
          <td style="padding:6px 8px">${r.status}</td>
          <td style="padding:6px 8px">${r.diffCount||0}</td>
        </tr>
        ${paramRows ? `<tr><td colspan="5" style="padding:0 0 8px 32px"><table style="width:100%;border-collapse:collapse">${paramRows}</table></td></tr>` : ''}`;
      }).join('');

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${filename}</title>
        <style>body{font-family:sans-serif;font-size:13px;padding:24px}table{width:100%;border-collapse:collapse}th{background:#f0f0f0;padding:6px 8px;text-align:left}td{border-bottom:1px solid #f0f0f0}</style>
        </head><body>
        <h2>Environment Comparison Report</h2>
        <p>Source: <strong>${sourceTenant?.name} (${srcEnv})</strong> → Target: <strong>${targetTenant?.name} (${tgtEnv})</strong></p>
        <p>Generated: ${new Date().toLocaleString()} | Total: ${results.summary.total} | Different: ${results.summary.different} | Same: ${results.summary.same}</p>
        <table><thead><tr><th>iFlow ID</th><th>Name</th><th>Package</th><th>Status</th><th>Diffs</th></tr></thead>
        <tbody>${htmlRows}</tbody></table></body></html>`;
      downloadFile(html, `${filename}.html`, 'text/html');
    }
  };

  // Expandable row: parameter diff table
  const expandedRowRender = (record) => {
    if (!record.parameters?.length) return <Text type="secondary" style={{ padding: '8px 16px', display: 'block' }}>No parameter data</Text>;
    const paramCols = [
      { title: 'Parameter Key', dataIndex: 'key', key: 'k', width: 240, ellipsis: true, render: v => <Text code style={{ fontSize: 11 }}>{v}</Text> },
      { title: `Source (${sourceTenant?.environment || 'src'})`, dataIndex: 'sourceValue', key: 's', ellipsis: true,
        render: (v, r) => <Text style={{ fontSize: 12, color: r.status === 'different' ? '#ff4d4f' : undefined }} delete={r.status === 'different' && v !== null}>{v ?? <Text type="secondary">—</Text>}</Text> },
      { title: `Target (${targetTenant?.environment || 'tgt'})`, dataIndex: 'targetValue', key: 't', ellipsis: true,
        render: (v, r) => <Text style={{ fontSize: 12, color: r.status === 'different' ? '#52c41a' : undefined }}>{v ?? <Text type="secondary">—</Text>}</Text> },
      { title: 'Status', dataIndex: 'status', key: 'ps', width: 120,
        render: v => v === 'same'
          ? <Tag color="success" style={{ fontSize: 10 }}>same</Tag>
          : <Tag color="warning" style={{ fontSize: 10 }}>{v}</Tag> }
    ];
    return (
      <Table
        dataSource={record.parameters}
        columns={paramCols}
        rowKey="key"
        size="small"
        pagination={false}
        rowClassName={r => r.status !== 'same' ? 'diff-row-changed' : ''}
        style={{ marginLeft: 48 }}
      />
    );
  };

  const tableColumns = [
    {
      title: 'iFlow',
      key: 'name',
      ellipsis: true,
      render: (_, r) => (
        <div>
          <Text style={{ fontSize: 13, fontWeight: 500 }}>{r.iflowName || r.iflowId}</Text>
          {r.iflowName && <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>{r.iflowId}</Text>}
        </div>
      )
    },
    { title: 'Package', dataIndex: 'packageId', key: 'pkg', width: 160, ellipsis: { showTitle: false },
      render: v => <Tooltip title={v}><Tag style={{ fontSize: 11, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', verticalAlign: 'middle' }}>{v || '—'}</Tag></Tooltip> },
    { title: 'Params', dataIndex: 'paramCount', key: 'pc', width: 70, align: 'center',
      render: v => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'Diffs', dataIndex: 'diffCount', key: 'dc', width: 60, align: 'center',
      render: (v, r) => r.status === 'different'
        ? <Badge count={v} color="orange" style={{ fontSize: 11 }} />
        : <Text type="secondary" style={{ fontSize: 12 }}>—</Text> },
    {
      title: 'Status', dataIndex: 'status', key: 'st', width: 140,
      render: v => {
        const m = STATUS_META[v] || STATUS_META.error;
        return <Badge status={m.color} text={<Text style={{ fontSize: 12 }}>{m.label}</Text>} />;
      }
    }
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>Environment Comparison</Title>
          <Text type="secondary">Compare configuration parameters between two environments to catch accidental overwrites.</Text>
        </div>
      </div>

      {/* ── Tenant selectors ── */}
      <div style={{ padding: '12px 16px', background: '#fafafa', borderRadius: 8, border: '1px solid #f0f0f0', marginBottom: 16 }}>
        <Space wrap size={16} align="end">
          <div>
            <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Source (reference)</Text>
            <Select placeholder="Source tenant…" style={{ width: 240 }} value={sourceTenantId} onChange={setCompareSourceTenantId} allowClear>
              {tenants.filter(t => t.id !== targetTenantId).map(t => (
                <Option key={t.id} value={t.id}>
                  <Space size={4}><Tag color="blue" style={{ margin: 0 }}>{t.environment?.toUpperCase()}</Tag>{t.name}</Space>
                </Option>
              ))}
            </Select>
          </div>
          <SwapOutlined style={{ fontSize: 18, color: '#999', marginBottom: 4 }} />
          <div>
            <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Target (to verify)</Text>
            <Select placeholder="Target tenant…" style={{ width: 240 }} value={targetTenantId} onChange={setCompareTargetTenantId} allowClear>
              {tenants.filter(t => t.id !== sourceTenantId).map(t => (
                <Option key={t.id} value={t.id}>
                  <Space size={4}><Tag color="blue" style={{ margin: 0 }}>{t.environment?.toUpperCase()}</Tag>{t.name}</Space>
                </Option>
              ))}
            </Select>
          </div>
          <Button
            type="primary"
            icon={<SyncOutlined />}
            onClick={handleCompare}
            loading={comparing}
            disabled={!sourceTenantId || !targetTenantId}
          >
            {comparing ? 'Comparing…' : 'Compare'}
          </Button>
          {results && !comparing && (
            <Button icon={<PlusOutlined />} onClick={() => { clearCompare(); setSearch(''); setPkgFilter([]); setStatusFilter(null); }}>
              New Compare
            </Button>
          )}
        </Space>
        {comparing && (
          <div style={{ marginTop: 10 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>Fetching configs from both tenants — this may take a moment for large tenant sets…</Text>
          </div>
        )}
        {comparing && (
          <Alert
            type="info"
            showIcon
            style={{ marginTop: 10 }}
            message="Compare running in background — you can navigate away and come back, results will be here."
          />
        )}
      </div>

      {!results && !comparing && (
        <div style={{ textAlign: 'center', padding: 64, color: '#bbb' }}>
          <SwapOutlined style={{ fontSize: 48, display: 'block', marginBottom: 12 }} />
          <Text type="secondary">Select two tenants and click Compare</Text>
        </div>
      )}

      {results && (
        <>
          {/* ── Summary ── */}
          <Row gutter={16} style={{ marginBottom: 16 }}>
            {[
              { label: 'Total iFlows', value: results.summary.total, color: undefined },
              { label: 'Identical', value: results.summary.same, color: '#3f8600' },
              { label: 'Different', value: results.summary.different, color: '#d46b08' },
              { label: 'Only in Source', value: results.summary.missingInTarget, color: '#cf1322' },
              { label: 'Only in Target', value: results.summary.missingInSource, color: '#888' }
            ].map(s => (
              <Col key={s.label} xs={12} sm={8} md={4}>
                <div style={{ padding: '8px 16px', background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0', textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 12, color: '#666' }}>{s.label}</div>
                </div>
              </Col>
            ))}
          </Row>

          {/* ── Filters + download ── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <Space wrap>
              <Input
                placeholder="Search iFlow…"
                prefix={<SearchOutlined />}
                style={{ width: 200 }}
                value={search}
                onChange={e => setSearch(e.target.value)}
                allowClear
              />
              <Select
                showSearch
                mode="multiple"
                allowClear
                placeholder="All packages…"
                style={{ width: 240 }}
                value={pkgFilter}
                onChange={setPkgFilter}
                disabled={!results}
                filterOption={(input, option) => option.value.toLowerCase().includes(input.toLowerCase())}
                options={packages.map(p => ({ value: p, label: p }))}
                maxTagCount="responsive"
              />
              <Select placeholder="All statuses" style={{ width: 160 }} value={statusFilter} onChange={setStatusFilter} allowClear>
                {Object.entries(STATUS_META).map(([k, m]) => (
                  <Option key={k} value={k}><Badge status={m.color} text={m.label} /></Option>
                ))}
              </Select>
              {(search || pkgFilter.length > 0 || statusFilter) && (
                <Text type="secondary" style={{ fontSize: 12 }}>{filteredRows.length} of {results.results.length} shown</Text>
              )}
            </Space>

            <Dropdown menu={{
              items: [
                { key: 'csv', label: 'Download CSV', icon: <DownloadOutlined />, onClick: () => handleDownload('csv') },
                { key: 'html', label: 'Download HTML Report', icon: <DownloadOutlined />, onClick: () => handleDownload('html') }
              ]
            }}>
              <Button icon={<DownloadOutlined />}>Download Report</Button>
            </Dropdown>
          </div>

          {/* ── Results table ── */}
          <Table
            dataSource={filteredRows}
            columns={tableColumns}
            rowKey="iflowId"
            size="small"
            expandable={{
              expandedRowRender,
              expandedRowKeys: expandedRows,
              onExpandedRowsChange: setExpandedRows,
              rowExpandable: r => r.parameters?.length > 0
            }}
            pagination={{ defaultPageSize: settings?.app?.defaultPageSize || 20, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], showTotal: t => `${t} iflows` }}
            scroll={{ x: 700 }}
            rowClassName={r => r.status === 'different' ? 'diff-row-changed' : ''}
          />
        </>
      )}
    </div>
  );
}
