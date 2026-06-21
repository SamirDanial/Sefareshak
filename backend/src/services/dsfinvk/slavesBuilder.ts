import { DsfinvkPosDevice, SlaveRow } from "./types";

/**
 * slaves.csv
 *
 * Builds the slave/terminal entries for all active POS devices in the organization.
 * Each device registered with Fiskaly appears as a slave terminal.
 */
export function buildSlaves(posDevices: DsfinvkPosDevice[], organizationName: string): SlaveRow[] {
  return posDevices.map((d) => ({
    terminal_id: String(d.deviceCode || d.id),
    terminal_brand: "Fiskaly",
    terminal_modell: "TSE",
    terminal_seriennr: String(d.fiskalyClientSerialNumber || d.fiskalyClientId || d.id),
    terminal_sw_brand: organizationName,
    terminal_sw_version: "1.0",
  }));
}
