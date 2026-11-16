import React, { useState } from 'react';
import { Card, Form, Input, Select, Button, message, Typography, Avatar } from 'antd';
import { SaveOutlined, CloudOutlined } from '@ant-design/icons';
import useStore from '../../store';
import { patchApp } from '../../api';

const { Title, Text } = Typography;
const { Option } = Select;

export default function General() {
  const { settings, refreshSettings } = useStore();
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const onFinish = async (values) => {
    setSaving(true);
    try {
      await patchApp(values);
      await refreshSettings();
      message.success('Settings saved');
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return null;

  return (
    <div>
      <Title level={5}>General Settings</Title>
      <Text type="secondary">Customize application name and default display options.</Text>

      <Card style={{ marginTop: 16, maxWidth: 600 }}>
        <Form
          form={form}
          layout="vertical"
          initialValues={settings.app}
          onFinish={onFinish}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
            <Avatar size={64} style={{ background: '#0070f3' }} icon={<CloudOutlined />} />
            <div>
              <Text strong>{settings.app.name || 'CPI Config Manager'}</Text>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>Application branding</Text>
            </div>
          </div>

          <Form.Item
            name="name"
            label="Application Name"
            rules={[{ required: true, message: 'Name is required' }]}
          >
            <Input placeholder="CPI Config Manager" />
          </Form.Item>

          <Form.Item name="defaultPageSize" label="Default Page Size">
            <Select style={{ width: 160 }}>
              <Option value={10}>10 rows</Option>
              <Option value={20}>20 rows</Option>
              <Option value={50}>50 rows</Option>
              <Option value={100}>100 rows</Option>
            </Select>
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
              Save Settings
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
