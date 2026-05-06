import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { AuthProvider } from './src/contexts/auth-context';
import RootNavigator from './src/navigation/RootNavigator';

// Show banners/sounds for foreground notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert:  true,
    shouldShowBanner: true,
    shouldShowList:   true,
    shouldPlaySound:  true,
    shouldSetBadge:   true,
  }),
});

// Let React Query use the device's real network state
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(!!state.isConnected)),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry:        1,
      staleTime:    30_000,
      gcTime:       1000 * 60 * 60 * 24, // keep cache for 24 h
      networkMode:  'offlineFirst',
    },
  },
});

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key:     'nv-query-cache',
});

export default function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24 }}
    >
      <AuthProvider>
        <StatusBar style="light" />
        <RootNavigator />
      </AuthProvider>
    </PersistQueryClientProvider>
  );
}
