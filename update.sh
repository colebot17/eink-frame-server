systemctl stop eink-frame.service
git fetch origin
git reset --hard origin/main
npm run build
systemctl start eink-frame.service