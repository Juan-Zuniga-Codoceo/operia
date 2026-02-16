module.exports = {
    apps: [{
        name: 'operia',
        script: './backend/server-postgres.js',
        instances: 2,
        exec_mode: 'cluster',
        env: {
            NODE_ENV: 'production',
            PORT: 3000
        },
        error_file: './logs/err.log',
        out_file: './logs/out.log',
        log_file: './logs/combined.log',
        time: true,
        max_memory_restart: '500M',
        autorestart: true,
        watch: false,
        // Restart delay
        restart_delay: 4000,
        // Max restarts in 1 minute
        max_restarts: 10,
        min_uptime: '10s'
    }]
};
