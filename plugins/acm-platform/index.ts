import { timingSafeEqual } from 'node:crypto';
import {
    Context, ForbiddenError, Handler, ObjectId, PERM,
    PRIV, ProblemModel, RecordModel, SystemModel, UserModel,
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
}
