const { defineConfig } = require('@playwright/test')
module.exports = defineConfig({testDir:'./tests',testIgnore:'**/live/**',timeout:30000,fullyParallel:false,use:{baseURL:'http://127.0.0.1:5193',viewport:{width:390,height:844}},webServer:{command:'npm run dev -- --host 127.0.0.1 --port 5193',url:'http://127.0.0.1:5193',reuseExistingServer:true},reporter:'list'})
