#!/bin/sh
set -eu
umask 077
mkdir -p /root/.hydro /data/file
if [ ! -f /root/.hydro/config.json ]; then
    printf '%s\n' '{"host":"mongo","port":"27017","name":"hydro"}' > /root/.hydro/config.json
fi
printf '%s\n' '["/src/packages/ui-default","/src/plugins/acm-platform"]' > /root/.hydro/addon.json
if [ ! -f /root/.hydro/platform-initialized ]; then
    test -n "${HYDRO_JUDGE_PASSWORD:-}"
    node /src/packages/hydrooj/bin/hydrooj.js cli user create judge@platform.invalid platform-judge "$HYDRO_JUDGE_PASSWORD" 2
    node /src/packages/hydrooj/bin/hydrooj.js cli user setJudge 2
    node /src/packages/hydrooj/bin/hydrooj.js cli system set server.host 0.0.0.0
    touch /root/.hydro/platform-initialized
fi
exec node /src/packages/hydrooj/bin/hydrooj.js
