#pragma once
// Hilfsfunktionen der Einheits-Firmware (gas-flowmeter.yaml): effektive
// Anlagen-ID und daraus abgeleitete MQTT-Topics. Die Anlagen-ID kommt zur
// Laufzeit aus dem Geraete-Webinterface; ohne Konfiguration faellt sie auf
// eine eindeutige, MAC-basierte ID zurueck (gleiches Suffix wie der Hostname).
#include <cctype>
#include <cstdio>
#include <string>

#include "esphome/core/helpers.h"

// Konfigurierten Wert auf Dashboard-taugliche Zeichen einschraenken: das
// Backend registriert nur IDs aus [A-Za-z0-9_-] mit max. 64 Zeichen.
static inline std::string gas_machine_id(const std::string &configured) {
  std::string out;
  for (char c : configured) {
    if (std::isalnum(static_cast<unsigned char>(c)) || c == '-' || c == '_')
      out += c;
    else if (c == ' ')
      out += '-';
  }
  if (out.size() > 64)
    out.resize(64);
  if (!out.empty())
    return out;
  // Fallback: letzte 3 MAC-Oktette (wie das Hostname-Suffix von name_add_mac_suffix)
  return "gas-" + esphome::get_mac_address().substr(6);
}

static inline std::string gas_topic(const std::string &configured, const char *leaf) {
  return "iwb/gas/" + gas_machine_id(configured) + "/" + leaf;
}

// Ethernet-MAC des Boards (Espressif-Schema: Basis-MAC + 3 im letzten Oktett).
// DAS ist die Adresse, die Switch/IT im Netz sehen — fuer die Freischaltung.
static inline std::string gas_eth_mac_pretty() {
  uint8_t mac[6];
  esphome::get_mac_address_raw(mac);
  mac[5] = (uint8_t) (mac[5] + 3);
  char buf[18];
  snprintf(buf, sizeof buf, "%02X:%02X:%02X:%02X:%02X:%02X",
           mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  return buf;
}
