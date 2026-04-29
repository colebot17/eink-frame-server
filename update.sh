systemctl stop eink-frame.service
git fetch origin
git reset --hard origin/main
npm install
cd client && npm install && cd ..
npm run build
systemctl start eink-frame.service