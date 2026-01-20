#!/bin/bash
cd /home/ec2-user/monorepo/apps/microblog/dist
/home/ec2-user/.nvm/versions/node/v24.12.0/bin/node -r source-map-support/register index.js "$@"
