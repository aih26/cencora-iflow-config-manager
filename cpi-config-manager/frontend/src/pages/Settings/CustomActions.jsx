import React, { useState, useEffect } from 'react';
import {
  Card, Table, Button, Modal, Form, Input, Select, Space, Tag,
  Typography, Popconfirm, message, Switch, Divider
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ApiOutlined, LinkOutlined } from '@ant-design/icons';
import { getCustomActions, createCustomAction, updateCustomAction, deleteCustomAction, getApiConfigs } from '../../api';
import { ENDPOINT_META } from './API';
import useStore from '../../store';

const { Title, Text } = Typography;
const { Option, OptGroup } = Select;

const METHOD_COLOR = { GET: 'blue', POST: 'green', PUT: 'orange', DELETE: 'red', PATCH: 'purple' };

function ActionForm({ action, apiCatalog, onFinish, onCancel }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const applyFromCatalog = (key) => {
    const entry = apiCatalog.find(a => a.key === key);
    if (!entry) return;
    form.setFieldsValue({ method: entry.method, apiEndpoint: entry.endpoint });
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try { await onFinish(values); }
    finally { setSaving(false); }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={action || { method: 'GET', showIn: ['dashboard'], enabled: true }}
    >
      {apiCatalog.length > 0 && (
        <>
          <Form.Item label={<Space><LinkOutlined />Select from API Catalog<Text type="secondary" style={{ fontSize: 12 }}>(auto-fills method + endpoint)</Text></Space>}>
            <Select
              placeholder="Pick an API to use as base…"
              allowClear
              onChange={applyFromCatalog}
              showSearch
              optionFilterProp="children"
            >
              <OptGroup label="Built-in CPI APIs">
                {apiCatalog.filter(a => !a.isCustom).map(a => (
                  <Option key={a.key} value={a.key}>
                    <Space size={4}>
                      <Tag color={METHOD_COLOR[a.method] || 'default'} style={{ fontSize: 11 }}>{a.method}</Tag>
                      {a.name}
                    </Space>
                  </Option>
                ))}
              </OptGroup>
              {apiCatalog.filter(a => a.isCustom).length > 0 && (
                <OptGroup label="Custom APIs">
                  {apiCatalog.filter(a => a.isCustom).map(a => (
                    <Option key={a.key} value={a.key}>
                      <Space size={4}>
                        <Tag color={METHOD_COLOR[a.method] || 'default'} style={{ fontSize: 11 }}>{a.method}</Tag>
                        {a.name}
                      </Space>
                    </Option>
                  ))}
                </OptGroup>
              )}
            </Select>
          </Form.Item>
          <Divider style={{ margin: '4px 0 16px' }} />
        </>
      )}

      <Form.Item name="label" label="Button Label" rules={[{ required: true }]}>
        <Input placeholder="e.g., Restart iFlow" />
      </Form.Item>
      <Form.Item name="description" label="Description">
        <Input placeholder="What does this action do?" />
      </Form.Item>
      <Form.Item name="method" label="HTTP Method">
        <Select style={{ width: 120 }}>
          {['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map(m => <Option key={m} value={m}>{m}</Option>)}
        </Select>
      </Form.Item>
      <Form.Item name="apiEndpoint" label="API Endpoint (relative to CPI host /api/v1)" rules={[{ required: true }]}>
        <Input placeholder="/IntegrationRuntimeArtifacts(Id='{iflowId}')/Start" />
      </Form.Item>
      <Form.Item name="showIn" label="Show In">
        <Select mode="multiple">
          <Option value="dashboard">Dashboard</Option>
          <Option value="export">Export Page</Option>
          <Option value="import">Import Page</Option>
        </Select>
      </Form.Item>
      <Form.Item name="confirmRequired" label="Require Confirmation" valuePropName="checked">
        <Switch />
      </Form.Item>
      <Form.Item name="enabled" label="Enabled" valuePropName="checked">
        <Switch defaultChecked />
      </Form.Item>
      <Space>
        <Button type="primary" onClick={handleSave} loading={saving}>
          {action?.id ? 'Save' : 'Add Action'}
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </Space>
    </Form>
  );
}

export default function CustomActions() {
  const { refreshCustomActions } = useStore();
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(null);
  const [apiCatalog, setApiCatalog] = useState([]);

  useEffect(() => { loadActions(); loadCatalog(); }, []);

  const loadActions = async () => {
    setLoading(true);
    try { setActions(await getCustomActions()); }
    catch (err) { message.error(err.message); }
    finally { setLoading(false); }
  };

  const loadCatalog = async () => {
    try {
      const configs = await getApiConfigs();
      const builtIn = Object.entries(ENDPOINT_META).map(([key, meta]) => ({
        key, isCustom: false, name: meta.name, method: meta.method, endpoint: meta.endpoint
      }));
      const custom = Object.entries(configs)
        .filter(([, v]) => v?.isCustom)
        .map(([id, v]) => ({ key: id, isCustom: true, name: v.name, method: v.method, endpoint: v.endpoint }));
      setApiCatalog([...builtIn, ...custom]);
    } catch (_) {}
  };

  const handleCreate = async (values) => {
    try {
      await createCustomAction(values);
      await loadActions();
      await refreshCustomActions();
      setModal(null);
      message.success('Action created');
    } catch (err) { message.error(err.message); }
  };

  const handleUpdate = async (values) => {
    try {
      await updateCustomAction(modal.id, values);
      await loadActions();
      await refreshCustomActions();
      setModal(null);
      message.success('Action updated');
    } catch (err) { message.error(err.message); }
  };

  const handleDelete = async (id) => {
    try {
      await deleteCustomAction(id);
      await loadActions();
      await refreshCustomActions();
      message.success('Action deleted');
    } catch (err) { message.error(err.message); }
  };

  const columns = [
    { title: 'Label', dataIndex: 'label', key: 'label', render: v => <Text strong>{v}</Text> },
    { title: 'Method', dataIndex: 'method', key: 'method', width: 80, render: m => <Tag color={METHOD_COLOR[m] || 'default'}>{m}</Tag> },
    { title: 'Endpoint', dataIndex: 'apiEndpoint', key: 'ep', ellipsis: true, render: v => <Text type="secondary" style={{ fontSize: 11 }}>{v}</Text> },
    { title: 'Show In', dataIndex: 'showIn', key: 'show', render: arr => (arr || []).map(s => <Tag key={s}>{s}</Tag>) },
    { title: 'Enabled', dataIndex: 'enabled', key: 'enabled', width: 80, render: v => v ? <Tag color="green">Yes</Tag> : <Tag>No</Tag> },
    {
      title: 'Actions', key: 'actions', width: 90,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => setModal(record)} />
          <Popconfirm title="Delete?" onConfirm={() => handleDelete(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title level={5} style={{ margin: 0 }}>Custom Actions</Title>
          <Text type="secondary">
            Add dynamic action buttons backed by CPI APIs. Pick from the API catalog or enter an endpoint manually.
          </Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModal({})}>
          Add Action
        </Button>
      </div>

      <Table
        dataSource={actions}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={false}
      />

      <Modal
        title={modal?.id ? 'Edit Action' : 'Add Custom Action'}
        open={!!modal}
        onCancel={() => setModal(null)}
        footer={null}
        width={560}
        destroyOnClose
      >
        {modal && (
          <ActionForm
            action={modal?.id ? modal : null}
            apiCatalog={apiCatalog}
            onFinish={modal?.id ? handleUpdate : handleCreate}
            onCancel={() => setModal(null)}
          />
        )}
      </Modal>
    </div>
  );
}
