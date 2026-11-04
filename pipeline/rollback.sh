#!/bin/bash
# Restore the old per-job cron lines and remove the pipeline tick.
set -euo pipefail
rm -f /etc/cron.d/jade-hr-pipeline
sed -i 's/^#DISABLED-BY-PIPELINE# //' /etc/cron.d/jade-hr-sync
echo "rolled back; old cron active again:"; grep -v '^#' /etc/cron.d/jade-hr-sync | grep -c . 
