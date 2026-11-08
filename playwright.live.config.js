const {defineConfig}=require('@playwright/test')
module.exports=defineConfig({testDir:'./tests/live',timeout:180000,workers:1,use:{actionTimeout:12000,baseURL:'http://127.0.0.1:5194',viewport:{width:390,height:844},trace:'retain-on-failure',screenshot:'only-on-failure'},reporter:'list',outputDir:'../deployment/20261106-acceptance/live-results'})
