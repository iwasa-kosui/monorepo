#!/bin/bash
cd /home/ec2-user/monorepo/apps/iori/dist
/home/ec2-user/.nvm/versions/node/v24.12.0/bin/node index.js "$@"
