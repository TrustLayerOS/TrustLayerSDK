export interface NetworkSignals {
  connectionType?: string;
  downlink?: number;
  effectiveType?: string;
  rtt?: number;
  timezone: string;
  language: string;
}

/**
 * Collects network-related signals from the browser environment.
 */
export async function collectNetworkSignals(): Promise<NetworkSignals> {
  const signals: NetworkSignals = {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
  };

  // Network Information API (Chrome/Edge only)
  const nav = navigator as Navigator & {
    connection?: {
      type?: string;
      downlink?: number;
      effectiveType?: string;
      rtt?: number;
    };
  };

  if (nav.connection) {
    signals.connectionType = nav.connection.type;
    signals.downlink = nav.connection.downlink;
    signals.effectiveType = nav.connection.effectiveType;
    signals.rtt = nav.connection.rtt;
  }

  return signals;
}
