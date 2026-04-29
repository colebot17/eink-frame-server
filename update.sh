systemctl stop eink-frame.service
git pull
npm run build
systemctl start eink-frame.service