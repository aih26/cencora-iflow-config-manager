import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { ConfigProvider, Layout, Menu, theme, Spin, Avatar, Typography, Badge } from 'antd';
import {
  DashboardOutlined,
  ExportOutlined,
  ImportOutlined,
  SettingOutlined,
  CloudOutlined,
  SwapOutlined,
  LoadingOutlined
} from '@ant-design/icons';
import useStore from './store';
import Dashboard from './pages/Dashboard';
import Export from './pages/Export';
import Import from './pages/Import';
import Compare from './pages/Compare';
import SettingsPage from './pages/Settings';

const { Sider, Content, Header } = Layout;
const { Text } = Typography;

const navItems = [
  { key: '/', label: 'Dashboard', icon: <DashboardOutlined /> },
  { key: '/export', label: 'Export', icon: <ExportOutlined /> },
  { key: '/import', label: 'Import / Update', icon: <ImportOutlined /> },
  { key: '/compare', label: 'Compare Envs', icon: <SwapOutlined /> },
  { key: '/settings', label: 'Settings', icon: <SettingOutlined /> }
];

function AppLayout() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const { settings, loading, compareRunning, exportRunning, importRunning } = useStore();

  const appName = settings?.app?.name || 'CPI Config Manager';
  const appTheme = settings?.app?.theme || 'light';

  const selectedKey = navItems
    .slice()
    .reverse()
    .find(item => location.pathname === item.key || location.pathname.startsWith(item.key + '/'))?.key || '/';

  return (
    <ConfigProvider
      theme={{
        algorithm: appTheme === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: { colorPrimary: '#0070f3', borderRadius: 6 }
      }}
    >
      <Layout style={{ height: '100vh' }}>
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          style={{ overflow: 'auto', height: '100vh', position: 'sticky', top: 0 }}
          theme="dark"
          width={220}
        >
          <div style={{
            padding: collapsed ? '16px 8px' : '16px 20px',
            display: 'flex', alignItems: 'center', gap: 10,
            borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: 8
          }}>
            <Avatar
              size={32}
              style={{ background: '#0070f3', flexShrink: 0 }}
              icon={<CloudOutlined />}
            />
            {!collapsed && (
              <Text style={{ color: '#fff', fontWeight: 600, fontSize: 14, lineHeight: '1.3' }}>
                {appName}
              </Text>
            )}
          </div>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[selectedKey]}
            items={navItems.map(item => {
              const busy =
                (item.key === '/compare' && compareRunning) ||
                (item.key === '/export' && exportRunning) ||
                (item.key === '/import' && importRunning);
              return {
                key: item.key,
                icon: busy
                  ? <Badge dot offset={[2, 0]} color="#faad14">{item.icon}</Badge>
                  : item.icon,
                label: busy
                  ? <NavLink to={item.key}>{item.label} <LoadingOutlined style={{ fontSize: 11, marginLeft: 4 }} /></NavLink>
                  : <NavLink to={item.key}>{item.label}</NavLink>
              };
            })}
          />
        </Sider>
        <Layout>
          <Content style={{ overflow: 'auto', background: '#f5f5f5' }}>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <Spin size="large" />
              </div>
            ) : (
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/export" element={<Export />} />
                <Route path="/import" element={<Import />} />
                <Route path="/compare" element={<Compare />} />
                <Route path="/settings/*" element={<SettingsPage />} />
              </Routes>
            )}
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}

export default function App() {
  const { init } = useStore();
  useEffect(() => { init(); }, []);

  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  );
}
