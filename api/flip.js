// Vercel 서버 함수: 동전 던지기 결과를 서버에서 정합니다.
// 위치: 프로젝트 맨 위 폴더의 api/flip.js  (src 폴더 안이 아님!)
// 필요한 설정: Vercel 환경변수 FIREBASE_SERVICE_ACCOUNT = 서비스 계정 키 JSON 파일의 전체 내용
const crypto = require('crypto');
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const DAILY_GAMES = 5;
const today = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); // KST

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function init() {
  if (getApps().length) return;
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) throw new HttpError(500, '서버 설정이 아직 끝나지 않았어요. (FIREBASE_SERVICE_ACCOUNT)');
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 요청만 가능해요.' });
  try {
    init();

    // 1) 로그인한 사람인지 확인
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    if (!m) throw new HttpError(401, '로그인이 필요해요.');
    let uid;
    try { uid = (await getAuth().verifyIdToken(m[1])).uid; }
    catch (e) { throw new HttpError(401, '로그인 정보가 만료됐어요. 새로고침 후 다시 로그인해 주세요.'); }

    // 2) 입력 검사
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const bet = body.bet;
    const choice = body.choice;
    if (!Number.isSafeInteger(bet) || bet < 1 || bet > 1e9) throw new HttpError(400, '베팅 금액이 올바르지 않아요.');
    if (choice !== 'front' && choice !== 'back') throw new HttpError(400, '앞면/뒷면 선택이 올바르지 않아요.');

    // 3) 트랜잭션: 최신 값을 읽고 → 결과를 정하고 → 골드/횟수/내역을 한 번에 저장
    const db = getFirestore();
    const ref = db.doc(`users/${uid}`);
    const out = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpError(404, '계정 정보를 찾을 수 없어요.');
      const d = snap.data();
      const isAdmin = d.isAdmin === true;
      const t = today();
      const games = d.lastPlayDate === t ? (d.remainingGames ?? DAILY_GAMES) : DAILY_GAMES;
      const gold = d.gold ?? 0;

      if (games <= 0) throw new HttpError(400, '오늘 남은 게임 횟수가 없어요.');
      if (!isAdmin && bet > gold) throw new HttpError(400, '골드가 부족해요.');

      const result = crypto.randomInt(2) === 0 ? 'front' : 'back';
      const win = result === choice;
      // 이기면 +베팅×2, 지면 -베팅 (기존 규칙 그대로). 관리자는 골드 변화 없음
      const delta = isAdmin ? 0 : (win ? bet * 2 : -bet);
      const newGold = gold + delta;
      const remainingGames = games - 1;

      tx.update(ref, { gold: newGold, remainingGames, lastPlayDate: t });
      if (!isAdmin) {
        tx.set(db.collection('transfers').doc(), {
          type: 'flip',
          uids: [uid],
          fromUid: uid,
          fromId: d.userId || '',
          amount: delta,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
      return { result, win, delta, gold: newGold, remainingGames };
    });

    return res.status(200).json(out);
  } catch (e) {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
    console.error('flip error:', e);
    return res.status(500).json({ error: '서버 오류가 발생했어요. 잠시 후 다시 시도해 주세요.' });
  }
};
