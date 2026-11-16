import React, { useState } from 'react';
import { Card, List, Button, Input, Space, Tag, Typography, Popconfirm, message, Empty, Tooltip } from 'antd';
import { PlusOutlined, DeleteOutlined, ClearOutlined } from '@ant-design/icons';
import useStore from '../../store';
import { createEnvironment, deleteEnvironment, clearExportFolder, clearImportFolder } from '../../api';

const { Title, Text } = Typography;

const ENV_COLORS = {
  dev: 'blue', qa: 'orange', stage: 'purple', prd: 'red',
  prod: 'red', production: 'red', test: 'cyan', uat: 'geekblue'
};

export default function Environments() {
  const { environments, refreshEnvironments } = useStore();
  const [newEnv, setNewEnv] = useState('');
  const [adding, setAdding] = useState(false);
  const [clearing, setClearing] = useState({});

  const handleAdd = async () => {
    const name = newEnv.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
    if (!name) return message.warning('Enter an environment name');
    setAdding(true);
    try {
      await createEnvironment(name);
      await refreshEnvironments();
      setNewEnv('');
      message.success(`Environment "${name}" added`);
    } catch (err) {
      message.error(err.message);
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (name) => {
    try {
      await deleteEnvironment(name);
      await refreshEnvironments();
      message.success(`Environment "${name}" removed`);
    } catch (err) {
      message.error(err.message);
    }
  };

  const handleClear = async (env, folder) => {
    const key = `${env}__${folder}`;
    setClearing(prev => ({ ...prev, [key]: true }));
    try {
      const fn = folder === 'exports' ? clearExportFolder : clearImportFolder;
      const result = await fn(env);
      message.success(`Cleared ${result.cleared} file(s) from ${folder}/${env}/`);
    } catch (err) {
      message.error(`Clear failed: ${err.message}`);
    } finally {
      setClearing(prev => ({ ...prev, [key]: false }));
    }
  };

  return (
    <div>
      <Title level={5}>Environments</Title>
      <Text type="secondary">
        Define your deployment environments (e.g., dev, qa, stage, prd). These are used to organize tenants and exported configs.
      </Text>

      <Card style={{ marginTop: 16, maxWidth: 600 }}>
        <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
          <Input
            placeholder="Environment name (e.g., uat, prod)"
            value={newEnv}
            onChange={e => setNewEnv(e.target.value)}
            onPressEnter={handleAdd}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd} loading={adding}>
            Add
          </Button>
        </Space.Compact>

        {environments.length === 0 ? (
          <Empty description="No environments configured" />
        ) : (
          <List
            dataSource={environments}
            renderItem={(env) => (
              <List.Item
                actions={[
                  <Tooltip title={`Clear all files in exports/${env}/`}>
                    <Popconfirm
                      title={`Clear exports/${env}/ folder?`}
                      description="All exported config files for this environment will be deleted. This cannot be undone."
                      okText="Clear"
                      okButtonProps={{ danger: true }}
                      onConfirm={() => handleClear(env, 'exports')}
                    >
                      <Button
                        size="small"
                        icon={<ClearOutlined />}
                        loading={clearing[`${env}__exports`]}
                      >
                        exports/
                      </Button>
                    </Popconfirm>
                  </Tooltip>,
                  <Tooltip title={`Clear all files in imports/${env}/`}>
                    <Popconfirm
                      title={`Clear imports/${env}/ folder?`}
                      description="All imported config files for this environment will be deleted. This cannot be undone."
                      okText="Clear"
                      okButtonProps={{ danger: true }}
                      onConfirm={() => handleClear(env, 'imports')}
                    >
                      <Button
                        size="small"
                        icon={<ClearOutlined />}
                        loading={clearing[`${env}__imports`]}
                      >
                        imports/
                      </Button>
                    </Popconfirm>
                  </Tooltip>,
                  <Popconfirm
                    title={`Remove "${env}" environment?`}
                    onConfirm={() => handleDelete(env)}
                  >
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      size="small"
                    />
                  </Popconfirm>
                ]}
              >
                <Space>
                  <Tag color={ENV_COLORS[env] || 'default'} style={{ fontSize: 13, padding: '2px 10px' }}>
                    {env.toUpperCase()}
                  </Tag>
                </Space>
              </List.Item>
            )}
          />
        )}
      </Card>
    </div>
  );
}
