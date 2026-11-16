import React, { useState } from 'react';
import {
  Card, Table, Switch, Input, Button, Space, Typography, message,
  InputNumber, Modal, Form, Select, Radio, Tag, Popconfirm, Tooltip
} from 'antd';
import {
  SaveOutlined, ArrowUpOutlined, ArrowDownOutlined,
  PlusOutlined, DeleteOutlined, InfoCircleOutlined
} from '@ant-design/icons';
import useStore from '../../store';
import { patchColumns } from '../../api';

const { Title, Text } = Typography;
const { Option } = Select;

const STANDARD_FIELDS = [
  'Id', 'Name', 'PackageId', 'Version', 'Description', 'Type', 'Mode',
  'DeployedBy', 'DeployedOn', 'CreatedBy', 'CreatedAt', 'ModifiedBy', 'ModifiedAt',
  'SupportedPlatform', 'Vendor'
];

function NewColumnModal({ onAdd, onClose }) {
  const [form] = Form.useForm();
  const [sourceType, setSourceType] = useState('field');

  const handleAdd = async () => {
    const values = await form.validateFields();
    const key = `custom_${Date.now()}`;
    const col = {
      key,
      label: values.label,
      visible: true,
      width: values.width || 150,
      custom: true,
      sourceType: values.sourceType,
      fieldPath: values.sourceType === 'field' ? values.fieldPath : undefined,
      fixedValue: values.sourceType === 'fixed' ? values.fixedValue : undefined
    };
    onAdd(col);
    onClose();
  };

  return (
    <Modal title="Add Custom Column" open onCancel={onClose} onOk={handleAdd} destroyOnClose width={480}>
      <Form form={form} layout="vertical" initialValues={{ sourceType: 'field', width: 150 }}>
        <Form.Item name="label" label="Column Label" rules={[{ required: true }]}>
          <Input placeholder="e.g., Environment Tag" />
        </Form.Item>

        <Form.Item name="sourceType" label="Data Source">
          <Radio.Group onChange={e => setSourceType(e.target.value)}>
            <Radio value="field">API Response Field</Radio>
            <Radio value="fixed">Fixed Value</Radio>
          </Radio.Group>
        </Form.Item>

        {sourceType === 'field' && (
          <Form.Item
            name="fieldPath"
            label={
              <Space>
                Field Path
                <Tooltip title={`Standard fields from CPI: ${STANDARD_FIELDS.join(', ')}. Extra fields become available after configuring $expand / $select in Settings > API.`}>
                  <InfoCircleOutlined style={{ color: '#888' }} />
                </Tooltip>
              </Space>
            }
            rules={[{ required: true }]}
          >
            <Select
              showSearch
              placeholder="Type a field name or pick from list"
              mode="combobox"
              filterOption={(input, opt) => opt.value.toLowerCase().includes(input.toLowerCase())}
            >
              {STANDARD_FIELDS.map(f => <Option key={f} value={f}>{f}</Option>)}
            </Select>
          </Form.Item>
        )}

        {sourceType === 'fixed' && (
          <Form.Item name="fixedValue" label="Fixed Value" rules={[{ required: true }]}>
            <Input placeholder="Value shown for every row" />
          </Form.Item>
        )}

        <Form.Item name="width" label="Width (px)">
          <InputNumber min={60} max={600} style={{ width: 100 }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default function Columns() {
  const { settings, refreshSettings } = useStore();
  const [columns, setColumns] = useState(settings?.dashboard?.columns || []);
  const [saving, setSaving] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);

  const updateColumn = (key, field, value) => {
    setColumns(prev => prev.map(c => c.key === key ? { ...c, [field]: value } : c));
  };

  const moveColumn = (key, dir) => {
    setColumns(prev => {
      const idx = prev.findIndex(c => c.key === key);
      if (idx < 0) return prev;
      const next = [...prev];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  };

  const removeColumn = (key) => {
    setColumns(prev => prev.filter(c => c.key !== key));
  };

  const handleAdd = (col) => {
    setColumns(prev => [...prev, col]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await patchColumns(columns);
      await refreshSettings();
      message.success('Columns updated');
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const tableColumns = [
    {
      title: 'Order',
      key: 'order',
      width: 80,
      render: (_, record, idx) => (
        <Space>
          <Button
            size="small"
            icon={<ArrowUpOutlined />}
            disabled={idx === 0}
            onClick={() => moveColumn(record.key, -1)}
          />
          <Button
            size="small"
            icon={<ArrowDownOutlined />}
            disabled={idx === columns.length - 1}
            onClick={() => moveColumn(record.key, 1)}
          />
        </Space>
      )
    },
    {
      title: 'Field Key',
      dataIndex: 'key',
      key: 'key',
      width: 180,
      render: (val, record) => (
        <Space>
          <Text code style={{ fontSize: 12 }}>{record.custom ? (record.fieldPath || record.fixedValue || val) : val}</Text>
          {record.custom && <Tag color="purple" style={{ fontSize: 10 }}>custom</Tag>}
        </Space>
      )
    },
    {
      title: 'Source',
      key: 'source',
      width: 130,
      render: (_, record) => {
        if (!record.custom) return <Text type="secondary" style={{ fontSize: 12 }}>built-in</Text>;
        if (record.sourceType === 'fixed') return <Tag color="gold">Fixed: {record.fixedValue}</Tag>;
        return <Tag color="geekblue">{record.fieldPath}</Tag>;
      }
    },
    {
      title: 'Label',
      dataIndex: 'label',
      key: 'label',
      render: (val, record) => (
        <Input
          size="small"
          value={val}
          onChange={e => updateColumn(record.key, 'label', e.target.value)}
          style={{ width: 160 }}
        />
      )
    },
    {
      title: 'Width',
      dataIndex: 'width',
      key: 'width',
      width: 100,
      render: (val, record) => (
        <InputNumber
          size="small"
          value={val}
          min={60}
          max={600}
          onChange={v => updateColumn(record.key, 'width', v)}
          style={{ width: 72 }}
        />
      )
    },
    {
      title: 'Visible',
      dataIndex: 'visible',
      key: 'visible',
      width: 70,
      render: (val, record) => (
        <Switch
          size="small"
          checked={val}
          onChange={v => updateColumn(record.key, 'visible', v)}
        />
      )
    },
    {
      title: '',
      key: 'del',
      width: 44,
      render: (_, record) =>
        record.custom ? (
          <Popconfirm title="Remove this column?" onConfirm={() => removeColumn(record.key)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        ) : null
    }
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title level={5} style={{ margin: 0 }}>Dashboard Columns</Title>
          <Text type="secondary">
            Configure columns, order, and visibility. Add custom columns sourced from any API response field.
          </Text>
        </div>
        <Space>
          <Button icon={<PlusOutlined />} onClick={() => setShowNewModal(true)}>
            New Column
          </Button>
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
            Save
          </Button>
        </Space>
      </div>

      <Card>
        <Table
          dataSource={columns}
          columns={tableColumns}
          rowKey="key"
          size="small"
          pagination={false}
        />
      </Card>

      {showNewModal && (
        <NewColumnModal onAdd={handleAdd} onClose={() => setShowNewModal(false)} />
      )}
    </div>
  );
}
