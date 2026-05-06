import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import DashboardScreen from '../screens/DashboardScreen';
import IncidentsScreen from '../screens/IncidentsScreen';
import IncidentDetailScreen from '../screens/IncidentDetailScreen';
import DevicesScreen from '../screens/DevicesScreen';
import AlertRulesScreen from '../screens/AlertRulesScreen';
import SettingsScreen from '../screens/SettingsScreen';
import MfaSetupScreen from '../screens/MfaSetupScreen';
import MapScreen from '../screens/MapScreen';

export type IncidentsStackParamList = {
  IncidentsList:  undefined;
  IncidentDetail: { id: string };
};

export type SettingsStackParamList = {
  SettingsHome: undefined;
  MfaSetup:     undefined;
};

export type AppTabParamList = {
  Dashboard: undefined;
  Incidents: undefined;
  Map:       undefined;
  Devices:   undefined;
  Rules:     undefined;
  Settings:  undefined;
};

const Tab            = createBottomTabNavigator<AppTabParamList>();
const IncidentsStack = createNativeStackNavigator<IncidentsStackParamList>();
const SettingsStack  = createNativeStackNavigator<SettingsStackParamList>();

const HEADER = { headerStyle: { backgroundColor: '#1e293b' }, headerTintColor: '#e2e8f0' };

function IncidentsNavigator() {
  return (
    <IncidentsStack.Navigator screenOptions={HEADER}>
      <IncidentsStack.Screen name="IncidentsList"  component={IncidentsScreen}       options={{ title: 'Incidents' }} />
      <IncidentsStack.Screen name="IncidentDetail" component={IncidentDetailScreen}   options={{ title: 'Incident Detail' }} />
    </IncidentsStack.Navigator>
  );
}

function SettingsNavigator() {
  return (
    <SettingsStack.Navigator screenOptions={HEADER}>
      <SettingsStack.Screen name="SettingsHome" component={SettingsScreen}  options={{ title: 'Settings' }} />
      <SettingsStack.Screen name="MfaSetup"     component={MfaSetupScreen}  options={{ title: 'Two-factor auth' }} />
    </SettingsStack.Navigator>
  );
}

const TAB_OPTS = {
  tabBarStyle:             { backgroundColor: '#1e293b', borderTopColor: '#334155' },
  tabBarActiveTintColor:   '#6366f1',
  tabBarInactiveTintColor: '#64748b',
  ...HEADER,
};

export default function AppNavigator() {
  return (
    <Tab.Navigator screenOptions={TAB_OPTS}>
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Incidents" component={IncidentsNavigator} options={{ headerShown: false }} />
      <Tab.Screen name="Map"       component={MapScreen}          options={{ title: 'Threat Map' }} />
      <Tab.Screen name="Devices"   component={DevicesScreen} />
      <Tab.Screen name="Rules"     component={AlertRulesScreen}   options={{ title: 'Alert Rules' }} />
      <Tab.Screen name="Settings"  component={SettingsNavigator}  options={{ headerShown: false }} />
    </Tab.Navigator>
  );
}
