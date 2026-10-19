import { timingSafeEqual } from 'node:crypto';
import {
    Context, ForbiddenError, Handler, ObjectId, PERM,
    PRIV, ProblemModel, RecordModel, Schema, SystemModel, UserModel,
} from 'hydrooj';

class PlatformBridge extends Handler {
    noCheckPermView = true;

    async prepare() {
        const expected = process.env.BRIDGE_SECRET || '';
        const provided = String(this.request.headers['x-platform-secret'] || '');
        if (expected.length < 32 || provided.length !== expected.length
            || !timingSafeEqual(Buffer.from(expected), Buffer.from(provided))) {
            throw new ForbiddenError();
        }
    }

    async post() {
        const input = this.request.body;
        if (input.action === 'login') {
            if (!SystemModel.get('server.login') || SystemModel.get('system.contestmode')) throw new ForbiddenError();
            const uname = typeof input.username === 'string' ? input.username : '';
            const password = typeof input.password === 'string' ? input.password : '';
            if (!uname || uname.length > 100 || !password || password.length > 1024) throw new ForbiddenError();
            await this.limitRate('platform_login', 60, 10, uname);
            const user = await UserModel.getByUname('system', uname);
            // Do not silently bypass two-factor authentication.
            if (!user || user.tfa || user.authn || !user.hasPriv(PRIV.PRIV_USER_PROFILE)) throw new ForbiddenError();
            await user.checkPassword(password);
            this.response.body = { uid: user._id, username: user.uname, admin: user.hasPriv(PRIV.PRIV_EDIT_SYSTEM) };
            return;
        }

        if (!Number.isSafeInteger(input.uid) || input.uid <= 0) throw new ForbiddenError();
        const user = await UserModel.getById('system', input.uid);
        if (!user.hasPriv(PRIV.PRIV_USER_PROFILE)) throw new ForbiddenError();
        if (input.action === 'identity') {
            this.response.body = { uid: user._id, username: user.uname, admin: user.hasPriv(PRIV.PRIV_EDIT_SYSTEM) };
            return;
        }
        if (!user.hasPerm(PERM.PERM_VIEW) || !user.hasPerm(PERM.PERM_VIEW_PROBLEM)) throw new ForbiddenError();
        if (input.action === 'problems') {
            const problems = await ProblemModel.getMulti('system', { hidden: false })
                .project({ docId: 1, title: 1, content: 1, tag: 1, difficulty: 1 })
                .sort({ docId: 1 }).limit(200).toArray();
            this.response.body = { problems };
            return;
        }
        const pid = Number(input.pid);
        if (!Number.isSafeInteger(pid) || pid <= 0) throw new ForbiddenError();
        const problem = await ProblemModel.get('system', pid);
        if (!problem || problem.hidden) throw new ForbiddenError();
        if (input.action === 'submit') {
            if (!user.hasPerm(PERM.PERM_SUBMIT_PROBLEM)) throw new ForbiddenError();
            if (typeof input.code !== 'string' || !input.code.trim() || input.code.length > 128 * 1024) throw new ForbiddenError();
            // The MVP deliberately exposes one bounded language, not arbitrary judge config.
            const lang = 'cc.cc17';
            const config = problem.config;
            if (typeof config !== 'object' || !config || (config.langs && !config.langs.includes(lang))) throw new ForbiddenError();
            await this.limitRate('platform_submit', 60, 10, String(user._id));
            const rid = await RecordModel.add('system', pid, user._id, lang, input.code, true);
            this.response.body = { rid: rid.toHexString() };
            return;
        }
        if (input.action === 'record') {
            if (typeof input.rid !== 'string' || !/^[a-f0-9]{24}$/.test(input.rid)) throw new ForbiddenError();
            const record = await RecordModel.get('system', new ObjectId(input.rid));
            if (!record || record.uid !== user._id || record.pid !== pid || record.contest) throw new ForbiddenError();
            this.response.body = {
                rid: record._id.toHexString(), uid: record.uid, pid: record.pid,
                status: record.status, score: record.score, time: record.time, memory: record.memory,
                created_at: record._id.getTimestamp().toISOString(),
            };
            return;
        }
        throw new ForbiddenError();
    }
}

export async function apply(ctx: Context) {
    ctx.Route('platform_bridge', '/platform/bridge', PlatformBridge);
    ctx.addScript('platformInit', 'Initialize the isolated platform judge', Schema.object({}), async () => {
        const password = process.env.HYDRO_JUDGE_PASSWORD;
        if (!password || password.length < 32) throw new Error('Missing judge secret');
        const existing = await UserModel.getByUname('system', 'platform-judge');
        const uid = existing?._id || await UserModel.create(
            'judge@platform.invalid', 'platform-judge', password, 2,
        );
        await UserModel.setPassword(uid, password);
        await UserModel.setJudge(uid);
        await SystemModel.set('server.host', '0.0.0.0');
        await SystemModel.set('storage', 'file');
        await SystemModel.set('storage.file.path', '/data/file');
        return true;
    });
    ctx.addScript('platformDemo', 'Create explicit development fixtures', Schema.object({}), async () => {
        if (process.env.ENABLE_DEMO_SEED !== 'true') throw new Error('Demo seed disabled');
        for (const name of ['admin', 'student', 'student2']) {
            const password = process.env[`DEMO_${name.toUpperCase()}_PASSWORD`];
            if (!password || password.length < 32) throw new Error('Missing demo secret');
            let user = await UserModel.getByUname('system', `demo-${name}`);
            if (!user) {
                const uid = await UserModel.create(`${name}@platform.invalid`, `demo-${name}`, password);
                user = await UserModel.getById('system', uid);
            }
            if (name === 'admin') await UserModel.setSuperAdmin(user._id);
        }
        const owner = await UserModel.getByUname('system', 'demo-admin');
        let problem = await ProblemModel.get('system', 'MVP1000');
        if (!problem) {
            const pid = await ProblemModel.add(
                'system', 'MVP1000', 'A + B',
                '读入两个整数 a 和 b，输出它们的和。\n\n输入：一行两个整数，绝对值不超过 10^9。\n\n输出：一行一个整数。\n\n样例输入：1 2\n\n样例输出：3',
                owner._id, ['入门'], { difficulty: 1 },
            );
            problem = await ProblemModel.get('system', pid);
        }
        const files = {
            'config.yaml': 'type: default\ntime: 1s\nmemory: 128m\n',
            '1.in': '1 2\n', '1.out': '3\n',
            '2.in': '-1000000000 1000000000\n', '2.out': '0\n',
            '3.in': '1000000000 1000000000\n', '3.out': '2000000000\n',
        };
        for (const [name, body] of Object.entries(files)) {
            await ProblemModel.addTestdata('system', problem.docId, name, Buffer.from(body), owner._id);
        }
        return true;
    });
}
