// Node-часть (main-процесс Electron, бот): хост-сервер и mDNS.
// Интерфейсы — контракт между треками B (реализация) и C (Electron main). Не менять без отдельной задачи.
export { startHostServer, type HostServerHandle, type HostServerOptions } from './host-server';
export { findHosts, publishHost, type DiscoveredHost } from './discovery';
