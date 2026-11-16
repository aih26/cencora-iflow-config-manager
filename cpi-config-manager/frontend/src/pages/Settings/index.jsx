import React from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { Layout, Menu, Typography } from 'antd';
import {
  AppstoreOutlined, EnvironmentOutlined, CloudServerOutlined,
  TableOutlined, ThunderboltOutlined, ApiOutlined, CodeOutlined
} from '@ant-design/icons';
import General from './General';
import Environments from './Environments';
import Tenants from './Tenants';
import Columns from './Columns';
import Concurrency from './Concurrency';
import CustomActions from './CustomActions';
import APISettings from './API';

const { Sider, Content } = Layout;
const { Title } = Typography;

const settingsNav = [
  { key: '/settings', label: 'General', icon: <AppstoreOutlined /> },
  { key: '/settings/environments', label: 'Environments', icon: <EnvironmentOutlined /> },
  { key: '/settings/tenants', label: 'Tenants', icon: <CloudServerOutlined /> },
  { key: '/settings/columns', label: 'Dashboard Columns', icon: <TableOutlined /> },
  { key: '/settings/concurrency', label: 'Concurrency', icon: <ThunderboltOutlined /> },
  { key: '/settings/api', label: 'API', icon: <CodeOutlined /> },
  { key: '/settings/custom-actions', label: 'Custom Actions', icon: <ApiOutlined /> }
];

export default function SettingsPage() {
  const location = useLocation();
  const selected = settingsNav.find(n => location.pathname === n.key)?.key || '/settings';

  return (
    <Layout style={{ minHeight: '100%', background: '#f5f5f5' }}>
      <Sider
        width={200}
        style={{ background: '#fff', borderRight: '1px solid #f0f0f0' }}
        theme="light"
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0' }}>
          <Title level={5} style={{ margin: 0 }}>Settings</Title>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selected]}
          style={{ borderRight: 0 }}
          items={settingsNav.map(item => ({
            key: item.key,
            icon: item.icon,
            label: <NavLink to={item.key}>{item.label}</NavLink>
          }))}
        />
      </Sider>
      <Content style={{ padding: 24, overflow: 'auto' }}>
        <Routes>
          <Route index element={<General />} />
          <Route path="environments" element={<Environments />} />
          <Route path="tenants" element={<Tenants />} />
          <Route path="columns" element={<Columns />} />
          <Route path="concurrency" element={<Concurrency />} />
          <Route path="api" element={<APISettings />} />
          <Route path="custom-actions" element={<CustomActions />} />
        </Routes>
      </Content>
    </Layout>
  );
}
