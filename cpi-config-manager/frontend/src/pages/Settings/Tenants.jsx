import React, { useState } from 'react';
import {
  Card, Button, Table, Modal, Form, Input, Select, Space, Tag, Typography,
  Popconfirm, message, Descriptions, Badge, Tooltip, Alert, Divider, Spin
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, SyncOutlined,
  CheckCircleOutlined, CloseCircleOutlined, KeyOutlined, ApiOutlined, EyeOutlined
} from '@ant-design/icons';
import useStore from '../../store';
import {
  createTenant, updateTenant, deleteTenant,
  refreshToken, getTokenInfo, testConnection
} from '../../api';

const { Title, Text } = Typography;
const { Option } = Select;

const ENV_COLORS = { dev: 'blue', qa: 'orange', stage: 'purple', prd: 'red', prod: 'red' };

function TenantForm({ tenant, environments, onFinish, onCancel }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await onFinish(values);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={tenant ? {
        name: tenant.name,
        environment: tenant.environment,
        host: tenant.host,
        description: tenant.description,
        'auth.clientId': tenant.auth?.clientId,
        'auth.clientSecret': '',
        'auth.tokenUrl': tenant.auth?.tokenUrl
      } : { 'auth.tokenUrl': '' }}
    >
      <Form.Item name="name" label="Tenant Name" rules={[{ required: true }]}>
        <Input placeholder="My Dev Tenant" />
      </Form.Item>
      <Form.Item name="environment" label="Environment" rules={[{ required: true }]}>
        <Select placeholder="Select environment">
          {environments.map(e => (
            <Option key={e} value={e}>
              <Tag color={ENV_COLORS[e] || 'default'}>{e.toUpperCase()}</Tag>
            </Option>
          ))}
        </Select>
      </Form.Item>
      <Form.Item name="host" label="CPI Host URL" rules={[{ required: true }]}>
        <Input placeholder="https://xxx.hci.ondemand.com" />
      </Form.Item>
      <Form.Item name="description" label="Description">
        <Input placeholder="Optional description" />
      </Form.Item>
      <Divider>OAuth2 Client Credentials</Divider>
      <Form.Item name={['auth', 'tokenUrl']} label="Token URL" rules={[{ required: true }]}>
        <Input placeholder="https://xxx.authentication.sap.hana.ondemand.com/oauth/token" />
      </Form.Item>
      <Form.Item name={['auth', 'clientId']} label="Client ID" rules={[{ required: true }]}>
        <Input placeholder="Client ID" />
      </Form.Item>
      <Form.Item
        name={['auth', 'clientSecret']}
        label="Client Secret"
        rules={[{ required: !tenant }]}
      >
        <Input.Password placeholder={tenant ? '(unchanged)' : 'Client Secret'} />
      </Form.Item>

      <Space>
        <Button type="primary" onClick={handleSave} loading={saving}>
          {tenant ? 'Save Changes' : 'Add Tenant'}
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </Space>
    </Form>
  );
}

function TokenInfoPanel({ tenantId }) {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getTokenInfo(tenantId);
      setInfo(data);
    } catch (e) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const data = await refreshToken(tenantId);
      await load();
      message.success('Token refreshed');
    } catch (err) {
      message.error(`Token refresh failed: ${err.message}`);
    } finally {
      setRefreshing(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testConnection(tenantId);
      setTestResult(result);
    } catch (err) {
      setTestResult({ ok: false, error: err.message });
    } finally {
      setTesting(false);
    }
  };

  React.useEffect(() => { load(); }, [tenantId]);

  if (loading) return <Spin />;

  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <Button size="small" icon={<SyncOutlined />} onClick={handleRefresh} loading={refreshing}>
          Refresh Token
        </Button>
        <Button size="small" icon={<ApiOutlined />} onClick={handleTest} loading={testing}>
          Test Connection
        </Button>
      </Space>

      {testResult && (
        <Alert
          type={testResult.ok ? 'success' : 'error'}
          message={testResult.ok ? `Connected — ${testResult.packageCount} packages found` : testResult.error}
          style={{ marginBottom: 12 }}
        />
      )}

      {info?.hasToken ? (
        <Descriptions size="small" column={1} bordered>
          <Descriptions.Item label="Status">
            {info.expired
              ? <Badge status="error" text="Expired" />
              : <Badge status="success" text="Valid" />
            }
          </Descriptions.Item>
          <Descriptions.Item label="Token">
            <Text code style={{ fontSize: 11 }}>{info.access_token}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="Fetched At">{info.fetched_at}</Descriptions.Item>
          <Descriptions.Item label="Expires At">{info.expires_at}</Descriptions.Item>
          <Descriptions.Item label="Last Refreshed">{info.lastRefreshed || '—'}</Descriptions.Item>
        </Descriptions>
      ) : (
        <Alert type="warning" message="No token. Click 'Refresh Token' to fetch one." />
      )}
    </div>
  );
}

export default function Tenants() {
  const { tenants, environments, refreshTenants } = useStore();
  const [modal, setModal] = useState(null);
  const [tokenModal, setTokenModal] = useState(null);

  const handleCreate = async (values) => {
    try {
      await createTenant(values);
      await refreshTenants();
      setModal(null);
      message.success('Tenant added');
    } catch (err) {
      message.error(err.message);
    }
  };

  const handleUpdate = async (values) => {
    try {
      await updateTenant(modal.id, values);
      await refreshTenants();
      setModal(null);
      message.success('Tenant updated');
    } catch (err) {
      message.error(err.message);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteTenant(id);
      await refreshTenants();
      message.success('Tenant deleted');
    } catch (err) {
      message.error(err.message);
    }
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (val, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{val}</Text>
          {record.description && <Text type="secondary" style={{ fontSize: 12 }}>{record.description}</Text>}
        </Space>
      )
    },
    {
      title: 'Environment',
      dataIndex: 'environment',
      key: 'env',
      width: 100,
      render: (val) => <Tag color={ENV_COLORS[val] || 'default'}>{val?.toUpperCase()}</Tag>
    },
    {
      title: 'Host',
      dataIndex: 'host',
      key: 'host',
      ellipsis: true,
      render: (val) => <Text type="secondary" style={{ fontSize: 12 }}>{val}</Text>
    },
    {
      title: 'Token',
      key: 'token',
      width: 80,
      render: (_, record) => (
        <Button
          size="small"
          icon={<KeyOutlined />}
          onClick={() => setTokenModal(record)}
        />
      )
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => setModal(record)} />
          <Popconfirm title="Delete tenant?" onConfirm={() => handleDelete(record.id)}>
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
          <Title level={5} style={{ margin: 0 }}>Tenants</Title>
          <Text type="secondary">Manage CPI tenant connections with OAuth2 credentials.</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModal({})}>
          Add Tenant
        </Button>
      </div>

      <Table
        dataSource={tenants}
        columns={columns}
        rowKey="id"
        size="small"
        pagination={false}
      />

      <Modal
        title={modal?.id ? 'Edit Tenant' : 'Add Tenant'}
        open={!!modal}
        onCancel={() => setModal(null)}
        footer={null}
        width={600}
        destroyOnClose
      >
        {modal && (
          <TenantForm
            tenant={modal?.id ? modal : null}
            environments={environments}
            onFinish={modal?.id ? handleUpdate : handleCreate}
            onCancel={() => setModal(null)}
          />
        )}
      </Modal>

      <Modal
        title={`Token — ${tokenModal?.name}`}
        open={!!tokenModal}
        onCancel={() => setTokenModal(null)}
        footer={null}
        width={580}
        destroyOnClose
      >
        {tokenModal && <TokenInfoPanel tenantId={tokenModal.id} />}
      </Modal>
    </div>
  );
}
