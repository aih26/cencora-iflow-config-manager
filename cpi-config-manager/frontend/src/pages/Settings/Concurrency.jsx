import React, { useState } from 'react';
import { Card, Form, InputNumber, Button, Typography, Alert, message, Divider } from 'antd';
import { SaveOutlined, ThunderboltOutlined } from '@ant-design/icons';
import useStore from '../../store';
import { patchConcurrency, patchExportSettings, patchImportSettings } from '../../api';

const { Title, Text } = Typography;

export default function Concurrency() {
  const { settings, refreshSettings } = useStore();
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const onFinish = async (values) => {
    setSaving(true);
    try {
      await patchConcurrency({ threads: values.threads });
      await patchExportSettings({ baseDir: values.exportBaseDir });
      await patchImportSettings({ baseDir: values.importBaseDir });
      await refreshSettings();
      message.success('Concurrency settings saved');
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return null;

  return (
    <div>
      <Title level={5}>Concurrency & Paths</Title>
      <Text type="secondary">Configure parallel processing threads and data directory paths.</Text>

      <Card style={{ marginTop: 16, maxWidth: 500 }}>
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            threads: settings.concurrency?.threads || 5,
            exportBaseDir: settings.export?.baseDir || 'exports',
            importBaseDir: settings.import?.baseDir || 'imports'
          }}
          onFinish={onFinish}
        >
          <Form.Item
            name="threads"
            label="Parallel Threads"
            help="Number of concurrent API calls when fetching/exporting/importing iflows"
          >
            <InputNumber min={1} max={20} style={{ width: 120 }} />
          </Form.Item>

          <Alert
            type="info"
            style={{ marginBottom: 16, fontSize: 12 }}
            message="Higher thread counts speed up bulk operations but may hit API rate limits."
          />

          <Divider>Directory Names (relative to backend/data/)</Divider>

          <Form.Item name="exportBaseDir" label="Export Directory">
            <input
              className="ant-input"
              style={{ width: '100%' }}
              defaultValue="exports"
            />
          </Form.Item>

          <Form.Item name="importBaseDir" label="Import Directory">
            <input
              className="ant-input"
              style={{ width: '100%' }}
              defaultValue="imports"
            />
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
