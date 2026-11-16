import React, { useState, useEffect } from 'react';
import {
  Card, Table, Button, Modal, Form, Input, Select, Space, Tag,
  Typography, message, Divider, Popconfirm
} from 'antd';
import { EditOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { getApiConfigs, patchApiConfigs, createCustomApi, updateCustomApi, deleteCustomApi } from '../../api';

const { Title, Text } = Typography;
const { Option } = Select;

const METHOD_COLOR = { GET: 'blue', POST: 'green', PUT: 'orange', DELETE: 'red', PATCH: 'purple' };

// Built-in endpoint metadata (display-only, not editable)
export const ENDPOINT_META = {
  listPackages: {
    name: 'List Packages',
    method: 'GET',
    endpoint: '/IntegrationPackages',
    description: 'Fetches all integration packages. Used on Dashboard load and Export page.',
    commonParams: ['$select', '$expand', '$filter', '$top', '$skip', '$orderby']
  },
  listIflows: {
    name: 'List iFlows',
    method: 'GET',
    endpoint: '/IntegrationPackages(\'{packageId}\')/IntegrationDesigntimeArtifacts',
    description: 'Fetches all iflows within a package. Called per-package during Dashboard load.',
    commonParams: ['$select', '$expand', '$filter', '$top', '$orderby']
  },
  runtimeStatus: {
    name: 'Runtime Status',
    method: 'GET',
    endpoint: '/IntegrationRuntimeArtifacts',
    description: 'Fetches live deployment status for up to 50 iflows.',
    commonParams: ['$select', '$expand', '$top']
  },
  getConfigurations: {
    name: 'Get Configurations',
    method: 'GET',
    endpoint: '/IntegrationDesigntimeArtifacts(Id=\'{id}\',Version=\'active\')/Configurations',
    description: 'Reads configurable parameters of an iflow.',
    commonParams: ['$select', '$filter']
  },
  updateConfiguration: {
    name: 'Update Configuration',
    method: 'PUT',
    endpoint: '/IntegrationDesigntimeArtifacts(Id=\'{id}\',Version=\'active\')/Configurations(\'{key}\')',
    description: 'Updates a single configurable parameter value.',
    commonParams: []
  },
  deployIflow: {
    name: 'Deploy iFlow',
    method: 'POST',
    endpoint: '/DeployIntegrationDesigntimeArtifact',
    description: 'Triggers deployment of an iflow to the runtime.',
    commonParams: []
  }
};

function ParamEditor({ title, value = {}, onChange }) {
  const [pairs, setPairs] = useState(() => Object.entries(value).map(([k, v]) => ({ k, v })));

  const commit = (next) => {
    setPairs(next);
    const obj = {};
    next.forEach(({ k, v }) => { if (k) obj[k] = v; });
    onChange(obj);
  };

  return (
    <div>
      <div style={{ marginBottom: 6, fontWeight: 500, fontSize: 13 }}>{title}</div>
      {pairs.map((p, i) => (
        <Space key={i} style={{ marginBottom: 4 }} size={4}>
          <Input size="small" style={{ width: 160 }} placeholder="name" value={p.k}
            onChange={e => commit(pairs.map((x, j) => j === i ? { ...x, k: e.target.value } : x))} />
          <Input size="small" style={{ width: 220 }} placeholder="value" value={p.v}
            onChange={e => commit(pairs.map((x, j) => j === i ? { ...x, v: e.target.value } : x))} />
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => commit(pairs.filter((_, j) => j !== i))} />
        </Space>
      ))}
      <Button size="small" icon={<PlusOutlined />} onClick={() => commit([...pairs, { k: '', v: '' }])} style={{ marginTop: 4 }}>Add</Button>
    </div>
  );
}

function ParamsModal({ apiKey, meta, config, onSave, onClose }) {
  const [extraParams, setExtraParams] = useState(config?.extraParams || {});
  const [extraHeaders, setExtraHeaders] = useState(config?.extraHeaders || {});
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(apiKey, { extraParams, extraHeaders }); onClose(); }
    finally { setSaving(false); }
  };

  return (
    <Modal title={`Extra Params — ${meta.name}`} open onCancel={onClose} onOk={handleSave} okText="Save" confirmLoading={saving} width={580} destroyOnClose>
      <div style={{ marginBottom: 12 }}>
        <Tag color={METHOD_COLOR[meta.method] || 'default'}>{meta.method}</Tag>
        <Text code style={{ fontSize: 12 }}>{meta.endpoint}</Text>
        <div style={{ marginTop: 4 }}><Text type="secondary" style={{ fontSize: 12 }}>{meta.description}</Text></div>
        {meta.commonParams?.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>Common params: </Text>
            {meta.commonParams.map(p => <Tag key={p} style={{ fontSize: 11 }}>{p}</Tag>)}
          </div>
        )}
      </div>
      <Divider style={{ margin: '12px 0' }} />
      <ParamEditor title="Extra Query Parameters" value={extraParams} onChange={setExtraParams} />
      <Divider style={{ margin: '12px 0' }} />
      <ParamEditor title="Extra Request Headers" value={extraHeaders} onChange={setExtraHeaders} />
    </Modal>
  );
}

function CustomApiModal({ entry, onSave, onClose }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try { await onSave(values); onClose(); }
    catch (e) { message.error(e.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal
      title={entry?.id ? 'Edit Custom API' : 'Add Custom API'}
      open onCancel={onClose} onOk={handleSave} okText="Save"
      confirmLoading={saving} width={520} destroyOnClose
    >
      <Form form={form} layout="vertical"
        initialValues={entry || { method: 'GET' }}
      >
        <Form.Item name="name" label="Name" rules={[{ required: true }]}>
          <Input placeholder="e.g., Start iFlow" />
        </Form.Item>
        <Form.Item name="method" label="HTTP Method" rules={[{ required: true }]}>
          <Select style={{ width: 120 }}>
            {['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map(m => <Option key={m} value={m}>{m}</Option>)}
          </Select>
        </Form.Item>
        <Form.Item name="endpoint" label="Endpoint Path (relative to CPI host /api/v1)" rules={[{ required: true }]}>
          <Input placeholder="/IntegrationRuntimeArtifacts(Id='{iflowId}')/Start" />
        </Form.Item>
        <Form.Item name="description" label="Description">
          <Input.TextArea rows={2} placeholder="What does this API do?" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default function APISettings() {
  const [configs, setConfigs] = useState({});
  const [loading, setLoading] = useState(false);
  const [paramsFor, setParamsFor] = useState(null);   // { key, meta, config }
  const [customModal, setCustomModal] = useState(null); // null | {} | existing entry

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try { setConfigs(await getApiConfigs()); }
    catch (err) { message.error(err.message); }
    finally { setLoading(false); }
  };

  const handleSaveParams = async (key, patch) => {
    try {
      const updated = await patchApiConfigs({ [key]: patch });
      setConfigs(updated);
      message.success('Saved');
    } catch (err) { message.error(err.message); throw err; }
  };

  const handleSaveCustom = async (values) => {
    if (customModal?.id) {
      await updateCustomApi(customModal.id, values);
    } else {
      await createCustomApi(values);
    }
    message.success('Saved');
    await load();
  };

  const handleDeleteCustom = async (id) => {
    try {
      await deleteCustomApi(id);
      message.success('Deleted');
      await load();
    } catch (err) { message.error(err.message); }
  };

  // Build rows: built-in first, then custom
  const builtInRows = Object.entries(ENDPOINT_META).map(([key, meta]) => ({
    key,
    isCustom: false,
    name: meta.name,
    method: meta.method,
    endpoint: meta.endpoint,
    description: meta.description,
    commonParams: meta.commonParams,
    config: configs[key] || { extraParams: {}, extraHeaders: {} }
  }));

  const customRows = Object.entries(configs)
    .filter(([, v]) => v?.isCustom)
    .map(([id, v]) => ({
      key: id,
      isCustom: true,
      name: v.name,
      method: v.method,
      endpoint: v.endpoint,
      description: v.description,
      commonParams: [],
      config: v
    }));

  const rows = [...builtInRows, ...customRows];

  const paramCount = (cfg) => ({
    p: Object.keys(cfg?.extraParams || {}).filter(Boolean).length,
    h: Object.keys(cfg?.extraHeaders || {}).filter(Boolean).length
  });

  const columns = [
    {
      title: 'API',
      key: 'name',
      render: (_, r) => (
        <div>
          <Space>
            <Tag color={METHOD_COLOR[r.method] || 'default'}>{r.method}</Tag>
            <Text strong>{r.name}</Text>
            {r.isCustom && <Tag color="purple" style={{ fontSize: 11 }}>custom</Tag>}
          </Space>
          <div><Text code style={{ fontSize: 11 }}>{r.endpoint}</Text></div>
          <Text type="secondary" style={{ fontSize: 12 }}>{r.description}</Text>
        </div>
      )
    },
    {
      title: 'Extra Params / Headers',
      key: 'configured',
      width: 190,
      render: (_, r) => {
        const { p, h } = paramCount(r.config);
        return (
          <Space>
            {p > 0 ? <Tag color="blue">{p} param{p > 1 ? 's' : ''}</Tag> : <Text type="secondary" style={{ fontSize: 12 }}>—</Text>}
            {h > 0 && <Tag color="purple">{h} header{h > 1 ? 's' : ''}</Tag>}
          </Space>
        );
      }
    },
    {
      title: '',
      key: 'actions',
      width: 110,
      render: (_, r) => (
        <Space>
          <Button size="small" icon={<EditOutlined />}
            onClick={() => setParamsFor({ key: r.key, meta: { name: r.name, method: r.method, endpoint: r.endpoint, description: r.description, commonParams: r.commonParams }, config: r.config })}>
            Params
          </Button>
          {r.isCustom && (
            <>
              <Button size="small"
                onClick={() => setCustomModal({ id: r.key, name: r.name, method: r.method, endpoint: r.endpoint, description: r.description })}>
                <EditOutlined />
              </Button>
              <Popconfirm title="Delete this custom API?" onConfirm={() => handleDeleteCustom(r.key)}>
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </>
          )}
        </Space>
      )
    }
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <Title level={5} style={{ margin: 0 }}>API Configuration</Title>
          <Text type="secondary">
            Add extra OData query params or HTTP headers to any CPI API call.
            Custom APIs you add here are available as targets in Custom Actions.
          </Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCustomModal({})}>
          Add Custom API
        </Button>
      </div>

      <Card>
        <Table dataSource={rows} columns={columns} loading={loading} rowKey="key" size="small" pagination={false} />
      </Card>

      {paramsFor && (
        <ParamsModal
          apiKey={paramsFor.key}
          meta={paramsFor.meta}
          config={paramsFor.config}
          onSave={handleSaveParams}
          onClose={() => setParamsFor(null)}
        />
      )}

      {customModal !== null && (
        <CustomApiModal
          entry={customModal?.id ? customModal : null}
          onSave={handleSaveCustom}
          onClose={() => setCustomModal(null)}
        />
      )}
    </div>
  );
}
