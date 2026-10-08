#!/bin/bash
# Shared settings overlay; Native Kconfig and package metadata stay untouched.
set -euo pipefail

WRT_DEFAULTS="$(dirname "${BASH_SOURCE[0]}")/build-defaults.conf"
if [ -f "$WRT_DEFAULTS" ]; then source "$WRT_DEFAULTS"; fi
: "${WRT_LAN_IP:=192.168.1.1}"
: "${WRT_ZONENAME:=Asia/Shanghai}"
: "${WRT_TIMEZONE:=CST-8}"
: "${WRT_NTP_1:=ntp.aliyun.com}"
: "${WRT_NTP_2:=time1.cloud.tencent.com}"
: "${WRT_NTP_3:=cn.ntp.org.cn}"
: "${WRT_NTP_4:=cn.pool.ntp.org}"
: "${WRT_THEME:=luci-theme-bootstrap}"
: "${WRT_THEME_MODE:=explicit}"

# Request values are validated by the parser; direct P2 callers must not inject
# shell source either. Timezone syntax includes POSIX <+/-NN> abbreviations.
for value in "$WRT_LAN_IP" "$WRT_ZONENAME" "$WRT_TIMEZONE" "$WRT_NTP_1" "$WRT_NTP_2" "$WRT_NTP_3" "$WRT_NTP_4" "$WRT_THEME"; do
  if [[ ! "$value" =~ ^[A-Za-z0-9_./:+,\<\>-]+$ ]]; then
    echo 'Invalid firmware setting' >&2
    exit 1
  fi
done
case "$WRT_THEME_MODE" in inherit|explicit) ;; *) echo 'Invalid theme mode' >&2; exit 1 ;; esac
case "$WRT_THEME" in
  luci-theme-openwrt-2020) WRT_THEME_MEDIA="openwrt2020" ;;
  luci-theme-*) WRT_THEME_MEDIA="${WRT_THEME#luci-theme-}" ;;
  *) echo 'Invalid theme package' >&2; exit 1 ;;
esac

# OpenWrt processes uci-defaults in filename order. The shared late overlay
# follows audited numeric/zzz defaults without changing their files.
mkdir -p files/etc/uci-defaults
SETTINGS=files/etc/uci-defaults/zzzz-weig-system
{
  printf '%s\n' '#!/bin/sh' \
    "uci -q set network.lan.ipaddr='$WRT_LAN_IP'" \
    'uci -q commit network' \
    "uci -q set system.@system[0].zonename='$WRT_ZONENAME'" \
    "uci -q set system.@system[0].timezone='$WRT_TIMEZONE'" \
    'uci -q delete system.ntp.server' \
    "uci -q add_list system.ntp.server='$WRT_NTP_1'" \
    "uci -q add_list system.ntp.server='$WRT_NTP_2'" \
    "uci -q add_list system.ntp.server='$WRT_NTP_3'" \
    "uci -q add_list system.ntp.server='$WRT_NTP_4'" \
    'uci -q commit system'
  if [ "$WRT_THEME_MODE" = explicit ]; then
    printf '%s\n' "uci -q set luci.main.mediaurlbase='/luci-static/$WRT_THEME_MEDIA'" 'uci -q commit luci'
  fi
  printf '%s\n' 'exit 0'
} > "$SETTINGS"
chmod +x "$SETTINGS"
