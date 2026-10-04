#!/bin/bash
# Retain the published adapter path; firmware settings have one implementation.
set -e
exec bash "$(dirname "${BASH_SOURCE[0]}")/diy2-generic.sh"
