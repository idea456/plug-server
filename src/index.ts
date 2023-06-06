import PlugServer from './plug-server';

const server = new PlugServer({
    host: 'localhost',
    port: 4567,
});

(async () => {
    await server.accept();
})();
