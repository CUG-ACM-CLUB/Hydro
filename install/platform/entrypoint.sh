#!/bin/sh
set -eu
umask 077
mkdir -p /root/.hydro /data/file
if [ ! -f /root/.hydro/config.json ]; then
    printf '%s\n' '{"host":"mongo","port":"27017","name":"hydro"}' > /root/.hydro/config.json
fi
printf '%s\n' '["/src/packages/ui-default","/src/plugins/acm-platform"]' > /root/.hydro/addon.json
node /src/packages/hydrooj/bin/hydrooj.js cli script platformInit '{}'
exec node /src/packages/hydrooj/bin/hydrooj.js
