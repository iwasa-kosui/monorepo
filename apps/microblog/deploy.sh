pnpm build
ssh microblog "sudo mkdir -p /opt/microblog"
ssh microblog "sudo mkdir -p /etc/systemd/system/microblog.service.d"
rsync -av --rsync-path="sudo rsync" microblog.service microblog:/etc/systemd/system/microblog.service
rsync -av --rsync-path="sudo rsync" microblog.sh microblog:/usr/local/bin/microblog
rsync -av --rsync-path="sudo rsync" microblog.cjs microblog:/opt/microblog/microblog.cjs
rsync -av --rsync-path="sudo rsync" nginx.conf microblog:/etc/nginx/nginx.conf
rsync -av --rsync-path="sudo rsync" env.conf microblog:/etc/systemd/system/microblog.service.d/env.conf
ssh microblog "sudo chmod +x /usr/local/bin/microblog"
ssh microblog "sudo systemctl daemon-reload"
ssh microblog "sudo systemctl enable microblog"
ssh microblog "sudo systemctl restart microblog"
ssh microblog "sudo systemctl restart nginx"
