import React, { useState, useEffect } from 'react';
import { 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  runTransaction,
  serverTimestamp
} from 'firebase/firestore';
import { auth, db } from './firebase';

// 인벤토리: { 아이템이름: 개수 } (예전 배열 형식도 자동 변환)
const toInv = (v) => Array.isArray(v)
  ? v.reduce((a, n) => ({ ...a, [n]: (a[n] || 0) + 1 }), {})
  : (v ?? {});
const invText = (inv) => {
  const list = Object.keys(inv).filter((k) => inv[k] > 0).map((k) => `${k} ×${inv[k]}`);
  return list.length > 0 ? list.join(', ') : '없음';
};

// 오류 안내 문구 (Firebase 사용량 초과 등)
const errMsg = (e) =>
  e && e.code === 'resource-exhausted'
    ? '접속자가 많아 지금은 처리할 수 없어요. 잠시 후 다시 시도해 주세요.'
    : (e && e.message) || '알 수 없는 오류가 발생했어요.';

// 하루에 주어지는 동전 던지기 횟수
const DAILY_GAMES = 5;

// 오늘 날짜 문자열 (예: 2026-10-20) - 한국 시간(KST) 기준
const getTodayString = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

// 전역 CSS (폰트, 레이아웃, 애니메이션)
const globalCss = `
@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css');
body {
  margin: 0; background-attachment: fixed;
  background:
    radial-gradient(ellipse at 25% 0%, #33509F 0%, rgba(51,80,159,0) 55%),
    radial-gradient(ellipse at 90% 95%, #22388A 0%, rgba(34,56,138,0) 50%),
    #0B1330;
}
* { font-family: 'Pretendard', -apple-system, 'Segoe UI', 'Noto Sans KR', sans-serif; }
@keyframes coinSpin {
  0%   { transform: perspective(600px) rotateY(0deg) translateY(0); }
  50%  { transform: perspective(600px) rotateY(900deg) translateY(-44px); }
  100% { transform: perspective(600px) rotateY(1800deg) translateY(0); }
}
@keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.coin-flip { animation: coinSpin 0.8s ease-in-out; }
.app { display: flex; flex-direction: column; align-items: stretch; gap: 12px; }
button { transition: transform .12s ease, filter .12s ease; }
button:not(:disabled):hover { filter: brightness(1.12); }
button:not(:disabled):active { transform: scale(.97); }
input:focus, select:focus { border-color: #CFE0FF !important; }
`;

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // 현재 메뉴 탭: 'game' | 'shop' | 'transfer'
  const [activeTab, setActiveTab] = useState('game');

  // 로그인 입력값
  const [inputId, setInputId] = useState('');
  const [inputPw, setInputPw] = useState('');

  // 유저 데이터
  const [gold, setGold] = useState(1000);
  const [remainingGames, setRemainingGames] = useState(5);
  const [inventory, setInventory] = useState({});
  const [lastPlayDate, setLastPlayDate] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [buyQty, setBuyQty] = useState({});
  const [imgFailed, setImgFailed] = useState({}); // 이미지 파일이 없는 아이템 (이모지로 대체)

  // 날짜가 바뀌었으면 자동으로 하루 횟수로 초기화된 값으로 계산
  const currentRemaining = lastPlayDate === getTodayString() ? remainingGames : DAILY_GAMES;

  // 동전 던지기 상태
  const [selectedChoice, setSelectedChoice] = useState('front');
  const [betAmount, setBetAmount] = useState(100);
  const [isFlipping, setIsFlipping] = useState(false);
  const [currentCoinDisplay, setCurrentCoinDisplay] = useState('FRONT');
  const [resultMessage, setResultMessage] = useState('');
  const [resultType, setResultType] = useState('');

  // 양도 서브 탭: 'gold' | 'item'
  const [transferType, setTransferType] = useState('gold');

  // 골드 양도 상태
  const [targetUserId, setTargetUserId] = useState('');
  const [transferAmount, setTransferAmount] = useState(100);

  // 아이템 양도 상태
  const [targetItemUserId, setTargetItemUserId] = useState('');
  const [selectedItemToTransfer, setSelectedItemToTransfer] = useState('');

  // 상점 아이템 목록 (이름/설명 수정됨)
  const shopItems = [
    // img: public/images 폴더에 넣은 파일 이름 (파일이 없으면 icon 이모지가 대신 보입니다)
    { id: 'item_01', name: '테스트템1', price: 500, desc: '아이템 설명 적는 곳.', img: 'item1.png', icon: '🎁' },
    { id: 'item_02', name: '테스트템2', price: 1200, desc: '아이템 설명 적는 곳.', img: 'item2.png', icon: '🎁' },
    { id: 'item_03', name: '테스트템3', price: 300, desc: '아이템 설명 적는 곳.', img: 'item3.png', icon: '🎁' },
  ];

  // 한글 아이디를 이메일 형식으로 변환
  const getFakeEmail = (id) => `${encodeURIComponent(id.trim())}@mygame.com`;

  // 로그인 상태 감지 및 DB 조회 (없으면 자동 생성)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setLoadError(false);
        try {
          const userDocRef = doc(db, 'users', currentUser.uid);
          const userDoc = await getDoc(userDocRef);
          
          const displayId = currentUser.email ? decodeURIComponent(currentUser.email.split('@')[0]) : '';

          const today = getTodayString();

          if (userDoc.exists()) {
            const data = userDoc.data();
            setGold(data.gold ?? 1000);
            setInventory(toInv(data.inventory));
            setIsAdmin(data.isAdmin === true);

            if (data.lastPlayDate === today) {
              // 오늘 이미 접속한 기록이 있으면 저장된 횟수 사용
              setRemainingGames(data.remainingGames ?? DAILY_GAMES);
            } else {
              // 날짜가 바뀌었으면 횟수 초기화
              setRemainingGames(DAILY_GAMES);
              await setDoc(userDocRef, {
                remainingGames: DAILY_GAMES,
                lastPlayDate: today
              }, { merge: true });
            }
            setLastPlayDate(today);
          } else {
            // 문서가 없으면 기본값으로 자동 생성
            await setDoc(userDocRef, {
              userId: displayId,
              gold: 1000,
              remainingGames: DAILY_GAMES,
              lastPlayDate: today,
              inventory: {}
            });
            setGold(1000);
            setRemainingGames(DAILY_GAMES);
            setLastPlayDate(today);
            setInventory({});
          }
        } catch (error) {
          console.error("데이터 불러오기 에러:", error);
          setLoadError(true);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 로그인 처리
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (!inputId || !inputPw) {
      alert('아이디와 비밀번호를 모두 입력해주세요.');
      return;
    }

    const fakeEmail = getFakeEmail(inputId);

    try {
      await signInWithEmailAndPassword(auth, fakeEmail, inputPw);
    } catch (error) {
      alert('로그인 실패: 등록되지 않은 아이디이거나 비밀번호가 틀렸습니다.');
    }
  };

  // 로그아웃
  const handleLogout = async () => {
    await signOut(auth);
    setInputId('');
    setInputPw('');
  };

  // 동전 던지기 게임 로직
  const handleFlipCoin = async () => {
    if (currentRemaining <= 0) {
      alert('오늘 남은 게임 횟수가 없습니다!');
      return;
    }
    if (betAmount <= 0 || (!isAdmin && betAmount > gold)) {
      alert('베팅 금액을 다시 확인해 주세요.');
      return;
    }

    setIsFlipping(true);
    setResultMessage('');
    setResultType('');

    setTimeout(async () => {
      const coinResult = Math.random() < 0.5 ? 'front' : 'back';
      const isWin = selectedChoice === coinResult;
      const sideName = coinResult === 'front' ? '앞면(해)' : '뒷면(달)';

      let newGold = gold;
      let message;
      let type;
      if (isWin) {
        const winGold = betAmount;
        newGold += winGold * 2;
        message = `🎉 축하합니다! 동전은 [${sideName}]이었습니다. +${winGold * 2} 골드 획득!`;
        type = 'win';
      } else {
        newGold -= betAmount;
        message = `💀 아쉽네요! 동전은 [${sideName}]이었습니다. -${betAmount} 골드`;
        type = 'lose';
      }

      const today = getTodayString();
      if (isAdmin) newGold = gold; // 관리자는 골드 변화 없음
      const newRemainingGames = currentRemaining - 1;

      // 저장에 성공한 뒤에만 화면에 반영 (실패하면 아무것도 바뀌지 않음)
      if (user) {
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const displayId = user.email ? decodeURIComponent(user.email.split('@')[0]) : '';
          await setDoc(userDocRef, {
            userId: displayId,
            gold: newGold,
            remainingGames: newRemainingGames,
            lastPlayDate: today
          }, { merge: true });
        } catch (error) {
          console.error('동전 던지기 저장 실패:', error);
          alert(`저장에 실패해서 이번 게임은 기록되지 않았어요.\n${errMsg(error)}`);
          setIsFlipping(false);
          return;
        }
      }

      setCurrentCoinDisplay(coinResult === 'front' ? 'FRONT' : 'BACK');
      setResultMessage(message);
      setResultType(type);
      setGold(newGold);
      setRemainingGames(newRemainingGames);
      setLastPlayDate(today);
      setIsFlipping(false);
    }, 800);
  };

  // 아이템 구매 로직
  const handleBuyItem = async (item, qty = 1) => {
    const totalPrice = item.price * qty;
    if (!isAdmin && gold < totalPrice) {
      alert('골드가 부족합니다!');
      return;
    }


    const newGold = isAdmin ? gold : gold - totalPrice;
    const newInventory = { ...inventory, [item.name]: (inventory[item.name] || 0) + qty };

    if (user) {
      try {
        const userDocRef = doc(db, 'users', user.uid);
        const displayId = user.email ? decodeURIComponent(user.email.split('@')[0]) : '';
        await setDoc(userDocRef, {
          userId: displayId,
          gold: newGold,
          inventory: newInventory
        }, { merge: true });
      } catch (error) {
        console.error('구매 저장 실패:', error);
        alert(`구매에 실패했어요. 골드는 차감되지 않았어요.\n${errMsg(error)}`);
        return;
      }
    }

    setGold(newGold);
    setInventory(newInventory);
    alert(`[${item.name}] ${qty}개를 성공적으로 구매하셨습니다!`);
  };

  // 골드 양도(송금) 로직
  const handleTransferGold = async (e) => {
    e.preventDefault();
    const cleanTargetId = targetUserId.trim();

    if (!cleanTargetId) {
      alert('상대방 아이디를 입력해주세요.');
      return;
    }

    const currentDisplayId = user && user.email ? decodeURIComponent(user.email.split('@')[0]) : '';
    if (cleanTargetId === currentDisplayId) {
      alert('본인 계정으로는 골드를 보낼 수 없습니다.');
      return;
    }

    if (transferAmount <= 0 || (!isAdmin && transferAmount > gold)) {
      alert('양도할 골드 수량을 다시 확인해주세요.');
      return;
    }

    try {
      const q = query(collection(db, 'users'), where('userId', '==', cleanTargetId));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        alert('존재하지 않는 상대방 아이디입니다.');
        return;
      }

      const targetDoc = querySnapshot.docs[0];
      const targetDocRef = targetDoc.ref;
      const myDocRef = doc(db, 'users', user.uid);

      let goldAfter = null;
      await runTransaction(db, async (transaction) => {
        const myDoc = await transaction.get(myDocRef);
        if (!myDoc.exists()) throw new Error("내 계정 정보를 찾을 수 없습니다.");

        const myData = myDoc.data();
        if (!isAdmin && (myData.gold ?? 0) < transferAmount) {
          throw new Error("골드가 부족합니다.");
        }

        const targetData = targetDoc.data();
        const newMyGold = isAdmin ? (myData.gold ?? 0) : (myData.gold ?? 0) - transferAmount;
        const newTargetGold = (targetData.gold ?? 0) + transferAmount;

        if (!isAdmin) transaction.update(myDocRef, { gold: newMyGold });
        transaction.update(targetDocRef, { gold: newTargetGold });
        transaction.set(doc(collection(db, 'transfers')), {
          type: isAdmin ? 'grant' : 'gold',
          fromUid: user.uid,
          fromId: currentDisplayId,
          toUid: targetDoc.id,
          toId: cleanTargetId,
          amount: transferAmount,
          createdAt: serverTimestamp()
        });

        goldAfter = newMyGold;
      });
      if (goldAfter !== null) setGold(goldAfter);

      alert(`[${cleanTargetId}] 님에게 ${transferAmount.toLocaleString()} G를 성공적으로 전달했습니다!`);
      setTargetUserId('');
    } catch (error) {
      console.error("골드 양도 실패:", error);
      alert(`골드 양도 실패: ${errMsg(error)}`);
    }
  };

  // 아이템 양도 로직
  const handleTransferItem = async (e) => {
    e.preventDefault();
    const cleanTargetId = targetItemUserId.trim();

    if (!cleanTargetId) {
      alert('상대방 아이디를 입력해주세요.');
      return;
    }

    if (!selectedItemToTransfer) {
      alert('양도할 아이템을 선택해주세요.');
      return;
    }

    const currentDisplayId = user && user.email ? decodeURIComponent(user.email.split('@')[0]) : '';
    if (cleanTargetId === currentDisplayId) {
      alert('본인 계정으로는 아이템을 보낼 수 없습니다.');
      return;
    }

    try {
      const q = query(collection(db, 'users'), where('userId', '==', cleanTargetId));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        alert('존재하지 않는 상대방 아이디입니다.');
        return;
      }

      const targetDoc = querySnapshot.docs[0];
      const targetDocRef = targetDoc.ref;
      const myDocRef = doc(db, 'users', user.uid);

      let invAfter = null;
      await runTransaction(db, async (transaction) => {
        const myDoc = await transaction.get(myDocRef);
        if (!myDoc.exists()) throw new Error("내 계정 정보를 찾을 수 없습니다.");

        const myData = myDoc.data();
        const myInv = toInv(myData.inventory);
        if ((myInv[selectedItemToTransfer] || 0) < 1) {
          throw new Error("보유하지 않은 아이템입니다.");
        }
        const targetInv = toInv(targetDoc.data().inventory);
        const newMyInv = { ...myInv, [selectedItemToTransfer]: myInv[selectedItemToTransfer] - 1 };
        const newTargetInv = { ...targetInv, [selectedItemToTransfer]: (targetInv[selectedItemToTransfer] || 0) + 1 };

        transaction.update(myDocRef, { inventory: newMyInv });
        transaction.update(targetDocRef, { inventory: newTargetInv });
        transaction.set(doc(collection(db, 'transfers')), {
          type: 'item',
          fromUid: user.uid,
          fromId: currentDisplayId,
          toUid: targetDoc.id,
          toId: cleanTargetId,
          item: selectedItemToTransfer,
          createdAt: serverTimestamp()
        });

        invAfter = newMyInv;
      });
      if (invAfter !== null) setInventory(invAfter);

      alert(`[${cleanTargetId}] 님에게 [${selectedItemToTransfer}] 아이템을 전달했습니다!`);
      setTargetItemUserId('');
      setSelectedItemToTransfer('');
    } catch (error) {
      console.error("아이템 양도 실패:", error);
      alert(`아이템 양도 실패: ${errMsg(error)}`);
    }
  };

  const setQty = (id, v) =>
    setBuyQty((prev) => ({ ...prev, [id]: Math.min(99, Math.max(1, Math.floor(v) || 1)) }));

  // 양도 내역
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [sidePanel, setSidePanel] = useState('info'); // 'info' | 'history'

  const loadHistory = async () => {
    if (!user) return;
    setHistoryLoading(true);
    setHistoryError(false);
    try {
      const [sent, received] = await Promise.all([
        getDocs(query(collection(db, 'transfers'), where('fromUid', '==', user.uid))),
        getDocs(query(collection(db, 'transfers'), where('toUid', '==', user.uid))),
      ]);
      const list = [...sent.docs, ...received.docs].map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
      setHistory(list.slice(0, 50));
    } catch (error) {
      console.error('양도 내역 불러오기 실패:', error);
      setHistoryError(true);
    }
    setHistoryLoading(false);
  };

  useEffect(() => {
    if (sidePanel === 'history') loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidePanel, user]);

  const hasItems = Object.values(inventory).some((c) => c > 0);
  const displayUserId = user && user.email ? decodeURIComponent(user.email.split('@')[0]) : '플레이어';

  if (loading) {
    return <div style={{ color: '#fff', textAlign: 'center', marginTop: '50px' }}>로딩 중...</div>;
  }

  // 데이터 불러오기 실패 화면 (기본값을 보여주지 않고 이용을 막음)
  if (user && loadError) {
    return (
      <div style={styles.container}>
        <style>{globalCss}</style>
        <div style={{ ...styles.gameCard, maxWidth: '380px' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>⚠️</div>
          <h1 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '8px' }}>데이터를 불러오지 못했어요</h1>
          <p style={{ ...styles.subtitle, lineHeight: 1.6, textAlign: 'center' }}>
            접속자가 많거나 일시적인 문제일 수 있어요.<br />
            내 골드와 아이템은 안전하게 저장되어 있으니 잠시 후 다시 시도해 주세요.
          </p>
          <button onClick={() => window.location.reload()} style={styles.actionBtn}>다시 시도</button>
          <button onClick={handleLogout} style={{ ...styles.logoutBtn, marginTop: '12px' }}>로그아웃</button>
        </div>
      </div>
    );
  }

  // 로그인 화면
  if (!user) {
    return (
      <div style={styles.container}>
      <style>{globalCss}</style>
        <div style={{ ...styles.gameCard, maxWidth: '380px' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🛒</div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '4px' }}>SHOP 로그인</h1>
          <p style={styles.subtitle}>발급받은 아이디로 로그인하세요</p>

          <form onSubmit={handleLoginSubmit} style={{ width: '100%' }}>
            <div style={{ marginBottom: '14px', textAlign: 'left' }}>
              <label style={{ fontSize: '12px', color: '#9CA3AF', display: 'block', marginBottom: '4px' }}>아이디</label>
              <input
                type="text"
                placeholder="아이디 입력 (한글 가능)"
                value={inputId}
                onChange={(e) => setInputId(e.target.value)}
                style={styles.input}
              />
            </div>
            <div style={{ marginBottom: '20px', textAlign: 'left' }}>
              <label style={{ fontSize: '12px', color: '#9CA3AF', display: 'block', marginBottom: '4px' }}>비밀번호</label>
              <input
                type="password"
                placeholder="비밀번호 입력"
                value={inputPw}
                onChange={(e) => setInputPw(e.target.value)}
                style={styles.input}
              />
            </div>

            <button type="submit" style={styles.actionBtn}>
              로그인하기
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 로그인 후 메인 화면
  return (
    <div className="app" style={styles.pageBg}>
      <style>{globalCss}</style>
      {/* 상단 헤더 */}
      <div className="hdr" style={styles.header}>
        <div style={styles.headerTitle}>SHOP</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '12px', color: '#9DB0D6' }}>
            {displayUserId}{isAdmin && <span style={styles.adminBadge}>ADMIN</span>}
          </span>
          <button onClick={handleLogout} style={styles.logoutBtn}>로그아웃</button>
        </div>
      </div>

      {/* 내 정보 / 내역 패널 */}
      <div className="side" style={styles.dashboardCard}>
        <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
          <button
            onClick={() => setSidePanel('info')}
            style={{ ...styles.infoLabel, ...(sidePanel === 'info' ? styles.infoLabelOn : null) }}
          >
            내 정보
          </button>
          <button
            onClick={() => setSidePanel('history')}
            style={{ ...styles.infoLabel, ...(sidePanel === 'history' ? styles.infoLabelOn : null) }}
          >
            📜 내역
          </button>
        </div>

        {sidePanel === 'info' && (
          <>
            <div style={styles.infoRow}>
              <span>보유 골드</span>
              <b style={{ color: '#FBBF24', fontSize: '18px' }}>{isAdmin ? '∞ 무제한' : `${gold.toLocaleString()} G`}</b>
            </div>
            <div style={{ ...styles.infoRow, alignItems: 'flex-start' }}>
              <span style={{ whiteSpace: 'nowrap' }}>보유 아이템</span>
              <b style={{ textAlign: 'right', lineHeight: 1.5 }}>{invText(inventory)}</b>
            </div>
          </>
        )}

        {sidePanel === 'history' && (
          <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
            {historyLoading ? (
              <p style={{ ...styles.subText, textAlign: 'center' }}>불러오는 중...</p>
            ) : historyError ? (
              <p style={{ ...styles.subText, textAlign: 'center', color: '#FF4D6D' }}>
                내역을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
              </p>
            ) : history.length === 0 ? (
              <p style={{ ...styles.subText, textAlign: 'center' }}>내역이 없습니다.</p>
            ) : (
              history.map((h) => {
                const sent = h.fromUid === user.uid;
                const what = h.type !== 'item' ? `${(h.amount || 0).toLocaleString()} G` : `${h.item} ×1`;
                const when = h.createdAt?.toDate
                  ? h.createdAt.toDate().toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                  : '';
                return (
                  <div key={h.id} style={styles.historyRow}>
                    <div>
                      <div style={{ fontWeight: '700', color: h.type === 'grant' ? '#FBBF24' : sent ? '#FF4D6D' : '#CFE0FF' }}>
                        {h.type === 'grant' ? (sent ? `🎁 ${h.toId}에게 포인트 지급` : '🎁 포인트 지급') : sent ? `→ ${h.toId}에게 보냄` : `← ${h.fromId}에게 받음`}
                      </div>
                      <div style={{ fontSize: '11px', color: '#9DB0D6', marginTop: '2px' }}>{when}</div>
                    </div>
                    <div style={{ fontWeight: '800' }}>{sent && h.type !== 'grant' ? '-' : '+'}{what}</div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* 메뉴 탭 */}
      <div className="main" style={styles.tabGroup}>
        <button
          onClick={() => setActiveTab('game')}
          style={{
            ...styles.tabBtn,
            backgroundColor: activeTab === 'game' ? 'rgba(160,190,255,0.22)' : 'rgba(10,20,50,0.55)',
            color: activeTab === 'game' ? '#CFE0FF' : '#9DB0D6',
          }}
        >
          🎲 게임
        </button>
        <button
          onClick={() => setActiveTab('shop')}
          style={{
            ...styles.tabBtn,
            backgroundColor: activeTab === 'shop' ? 'rgba(160,190,255,0.22)' : 'rgba(10,20,50,0.55)',
            color: activeTab === 'shop' ? '#CFE0FF' : '#9DB0D6',
          }}
        >
          🛒 상점
        </button>
        <button
          onClick={() => setActiveTab('transfer')}
          style={{
            ...styles.tabBtn,
            backgroundColor: activeTab === 'transfer' ? 'rgba(160,190,255,0.22)' : 'rgba(10,20,50,0.55)',
            color: activeTab === 'transfer' ? '#CFE0FF' : '#9DB0D6',
          }}
        >
          💸 양도
        </button>
      </div>

      {/* TAB 1: 게임 */}
      {activeTab === 'game' && (
        <div className="main" style={styles.gameCard}>
          <div style={styles.gameTitle}>[ 동전 던지기 ]</div>

          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px',
            borderRadius: '4px', fontSize: '13px', fontWeight: '700',
            backgroundColor: 'rgba(8,15,40,0.7)', border: '1px solid rgba(160,190,255,0.25)',
            color: currentRemaining > 0 ? '#CFE0FF' : '#FF4D6D',
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              오늘 남은 횟수
            </span>
            <b style={{ fontSize: '16px', color: currentRemaining > 0 ? '#FFFFFF' : '#FF4D6D' }}>{currentRemaining}회</b>
          </div>

          <div className={isFlipping ? 'coin coin-flip' : 'coin'} style={styles.coinCircle}>
            {currentCoinDisplay === 'FRONT' ? '☀️' : '🌙'}
          </div>

          <p style={styles.subText}>선택하세요</p>
          <div style={styles.buttonGroup}>
            <button
              onClick={() => { setSelectedChoice('front'); setCurrentCoinDisplay('FRONT'); }}
              style={{
                ...styles.choiceBtn,
                backgroundColor: selectedChoice === 'front' ? 'rgba(160,190,255,0.22)' : 'rgba(10,20,50,0.55)',
                borderColor: selectedChoice === 'front' ? '#CFE0FF' : 'rgba(160,190,255,0.22)',
              }}
            >
              ☀️ 앞면 (해)
            </button>
            <button
              onClick={() => { setSelectedChoice('back'); setCurrentCoinDisplay('BACK'); }}
              style={{
                ...styles.choiceBtn,
                backgroundColor: selectedChoice === 'back' ? 'rgba(160,190,255,0.22)' : 'rgba(10,20,50,0.55)',
                borderColor: selectedChoice === 'back' ? '#CFE0FF' : 'rgba(160,190,255,0.22)',
              }}
            >
              🌙 뒷면 (달)
            </button>
          </div>

          <div style={{ width: '100%', marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: '#9CA3AF', marginBottom: '6px' }}>베팅 금액</label>
            <input
              type="number"
              value={betAmount}
              onChange={(e) => setBetAmount(Number(e.target.value))}
              style={styles.input}
            />
          </div>

          <button
            onClick={handleFlipCoin}
            disabled={isFlipping || currentRemaining <= 0}
            style={{
              ...styles.actionBtn,
              opacity: (isFlipping || currentRemaining <= 0) ? 0.5 : 1,
            }}
          >
            {isFlipping ? '동전 던지는 중...' : '동전 던지기!'}
          </button>

          {resultMessage && (
            <div style={{
              ...styles.resultBox,
              borderColor: resultType === 'win' ? '#10B981' : '#EF4444',
              color: resultType === 'win' ? '#6EE7B7' : '#FCA5A5'
            }}>
              {resultMessage}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: 상점 */}
      {activeTab === 'shop' && (
        <div className="main" style={styles.gameCard}>
          <div style={styles.gameTitle}>[ 아이템 상점 ]</div>
          <p style={styles.subText}>골드를 사용하여 필요한 아이템을 구매하세요</p>

          <div style={styles.shopGrid}>
            {shopItems.map((item) => {
              const owned = inventory[item.name] || 0;
              const qty = buyQty[item.id] || 1;
              const total = item.price * qty;
              const cantBuy = !isAdmin && gold < total;
              return (
                <div key={item.id} style={styles.shopCard}>
                  <div style={styles.priceTag}>{item.price.toLocaleString()}</div>
                  <div style={styles.thumb}>
                    {item.img && !imgFailed[item.id] ? (
                      <img
                        src={`${process.env.PUBLIC_URL}/images/${item.img}`}
                        alt={item.name}
                        style={styles.thumbImg}
                        onError={() => setImgFailed((prev) => ({ ...prev, [item.id]: true }))}
                      />
                    ) : (
                      <span>{item.icon || '🎁'}</span>
                    )}
                  </div>
                  <div style={{ fontWeight: '800', fontSize: '14px' }}>{item.name}</div>
                  <div style={{ fontSize: '11px', color: '#9DB0D6', margin: '2px 0 4px' }}>{item.desc}</div>
                  <div style={{ fontSize: '11px', color: '#CFE0FF', marginBottom: '8px' }}>보유 {owned}개</div>
                  <div style={styles.qtyRow}>
                    <button onClick={() => setQty(item.id, qty - 1)} style={styles.qtyBtn}>−</button>
                    <input
                      type="number"
                      min="1"
                      max="99"
                      value={qty}
                      onChange={(e) => setQty(item.id, Number(e.target.value))}
                      style={styles.qtyInput}
                    />
                    <button onClick={() => setQty(item.id, qty + 1)} style={styles.qtyBtn}>+</button>
                  </div>
                  <button
                    onClick={() => handleBuyItem(item, qty)}
                    disabled={cantBuy}
                    style={{ ...styles.buyBtn, opacity: cantBuy ? 0.45 : 1, cursor: cantBuy ? 'not-allowed' : 'pointer' }}
                  >
                    {isAdmin ? `${qty}개 구매 (무료)` : `${qty}개 구매 · ${total.toLocaleString()} G`}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: 양도 센터 */}
      {activeTab === 'transfer' && (
        <div className="main" style={styles.gameCard}>
          <div style={styles.gameTitle}>[ 양도 센터 ]</div>

          <div style={{ display: 'flex', gap: '6px', width: '100%', marginBottom: '16px' }}>
            <button
              onClick={() => setTransferType('gold')}
              style={{
                ...styles.subTabBtn,
                backgroundColor: transferType === 'gold' ? 'rgba(160,190,255,0.22)' : 'rgba(10,20,50,0.55)',
                color: transferType === 'gold' ? '#CFE0FF' : '#9DB0D6',
              }}
            >
              {isAdmin ? '🎁 포인트 지급' : '💰 골드 양도'}
            </button>
            <button
              onClick={() => setTransferType('item')}
              style={{
                ...styles.subTabBtn,
                backgroundColor: transferType === 'item' ? 'rgba(160,190,255,0.22)' : 'rgba(10,20,50,0.55)',
                color: transferType === 'item' ? '#CFE0FF' : '#9DB0D6',
              }}
            >
              🎒 아이템 양도
            </button>
          </div>


          {transferType === 'gold' && (
            <form onSubmit={handleTransferGold} style={{ width: '100%' }}>
              <div style={{ marginBottom: '14px', textAlign: 'left' }}>
                <label style={{ fontSize: '12px', color: '#9CA3AF', display: 'block', marginBottom: '4px' }}>받는 플레이어 아이디</label>
                <input
                  type="text"
                  placeholder="상대방 아이디 입력"
                  value={targetUserId}
                  onChange={(e) => setTargetUserId(e.target.value)}
                  style={styles.input}
                />
              </div>

              <div style={{ marginBottom: '20px', textAlign: 'left' }}>
                <label style={{ fontSize: '12px', color: '#9CA3AF', display: 'block', marginBottom: '4px' }}>{isAdmin ? '지급할 포인트' : '보낼 골드 수량'}</label>
                <input
                  type="number"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(Number(e.target.value))}
                  style={styles.input}
                />
              </div>

              <button type="submit" style={styles.actionBtn}>
                {isAdmin ? '포인트 지급하기' : '골드 전달하기'}
              </button>
            </form>
          )}

          {transferType === 'item' && (
            <form onSubmit={handleTransferItem} style={{ width: '100%' }}>
              <div style={{ marginBottom: '14px', textAlign: 'left' }}>
                <label style={{ fontSize: '12px', color: '#9CA3AF', display: 'block', marginBottom: '4px' }}>받는 플레이어 아이디</label>
                <input
                  type="text"
                  placeholder="상대방 아이디 입력"
                  value={targetItemUserId}
                  onChange={(e) => setTargetItemUserId(e.target.value)}
                  style={styles.input}
                />
              </div>

              <div style={{ marginBottom: '20px', textAlign: 'left' }}>
                <label style={{ fontSize: '12px', color: '#9CA3AF', display: 'block', marginBottom: '4px' }}>보낼 아이템 선택</label>
                {hasItems ? (
                  <select
                    value={selectedItemToTransfer}
                    onChange={(e) => setSelectedItemToTransfer(e.target.value)}
                    style={styles.input}
                  >
                    <option value="">-- 아이템을 선택하세요 --</option>
                    {Object.keys(inventory).filter((k) => inventory[k] > 0).map((itemName) => (
                      <option key={itemName} value={itemName}>
                        {itemName} (×{inventory[itemName]})
                      </option>
                    ))}
                  </select>
                ) : (
                  <p style={{ fontSize: '12px', color: '#EF4444', textAlign: 'center', margin: '8px 0' }}>
                    보유 중인 아이템이 없습니다.
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={!hasItems}
                style={{
                  ...styles.actionBtn,
                  opacity: !hasItems ? 0.5 : 1,
                  cursor: !hasItems ? 'not-allowed' : 'pointer',
                }}
              >
                아이템 전달하기
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

const panel = {
  backgroundColor: 'rgba(22,36,84,0.62)',
  border: '1px solid rgba(160,190,255,0.25)',
  borderRadius: '6px',
  boxShadow: 'inset 0 0 0 3px rgba(10,20,50,0.35)',
};

const styles = {
  container: {
    minHeight: '100vh', color: '#FFFFFF', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', padding: '24px 16px', boxSizing: 'border-box',
  },
  pageBg: {
    width: '100%', maxWidth: '380px', margin: '0 auto', padding: '16px 16px 48px',
    boxSizing: 'border-box', color: '#FFFFFF', minHeight: '100vh',
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 2px 6px' },
  headerTitle: { fontSize: '20px', fontWeight: '800', letterSpacing: '0.5px' },
  adminBadge: {
    marginLeft: '6px', padding: '2px 6px', borderRadius: '4px', fontSize: '10px',
    fontWeight: '800', backgroundColor: '#FBBF24', color: '#0B1430',
  },
  dashboardCard: { ...panel, padding: '16px', boxSizing: 'border-box' },
  infoLabel: {
    padding: '6px 18px', fontWeight: '800', fontSize: '14px', cursor: 'pointer',
    color: '#9DB0D6', backgroundColor: 'transparent', border: 'none', borderBottom: '2px solid transparent',
  },
  infoLabelOn: {
    color: '#FFFFFF', backgroundColor: 'rgba(160,190,255,0.2)', borderBottom: '2px solid #CFE0FF',
  },
  infoRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px',
    padding: '11px 4px', fontSize: '13px', color: '#9DB0D6',
    borderBottom: '1px solid rgba(160,190,255,0.12)',
  },
  tabGroup: {
    display: 'flex', width: '100%', boxSizing: 'border-box', backgroundColor: 'rgba(10,18,48,0.6)',
    border: '1px solid rgba(160,190,255,0.25)', borderRadius: '6px', overflow: 'hidden',
  },
  tabBtn: {
    flex: 1, padding: '14px 0', border: 'none', borderRadius: 0,
    fontWeight: '700', fontSize: '14px', cursor: 'pointer',
  },
  subTabBtn: {
    flex: 1, padding: '10px 0', borderRadius: '4px', border: '1px solid rgba(160,190,255,0.22)',
    fontWeight: '700', fontSize: '12px', cursor: 'pointer',
  },
  gameCard: {
    ...panel, width: '100%', padding: '22px', display: 'flex', flexDirection: 'column',
    alignItems: 'center', boxSizing: 'border-box', animation: 'fadeUp .3s ease both',
  },
  gameTitle: { fontSize: '18px', fontWeight: '800', marginBottom: '8px', color: '#FFFFFF' },
  subText: { fontSize: '12px', color: '#9DB0D6' },
  subtitle: { fontSize: '13px', color: '#9DB0D6', marginBottom: '22px' },
  coinCircle: {
    width: '112px', height: '112px', borderRadius: '50%', backgroundColor: '#F5C451',
    border: '6px solid #E0A82E', boxShadow: 'inset 0 0 0 5px rgba(255,255,255,0.3)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '46px', margin: '20px 0', boxSizing: 'border-box',
  },
  buttonGroup: { display: 'flex', gap: '10px', width: '100%', maxWidth: '420px', marginTop: '8px', marginBottom: '16px' },
  choiceBtn: {
    flex: 1, padding: '13px', borderRadius: '4px', color: '#FFFFFF',
    fontWeight: '700', border: '1.5px solid rgba(160,190,255,0.22)', cursor: 'pointer', fontSize: '13px',
  },
  input: {
    width: '100%', backgroundColor: 'rgba(8,15,40,0.7)', border: '1px solid rgba(160,190,255,0.25)',
    borderRadius: '4px', padding: '14px', color: '#FFFFFF', fontSize: '16px',
    fontWeight: '700', textAlign: 'center', boxSizing: 'border-box', outline: 'none',
  },
  actionBtn: {
    width: '100%', maxWidth: '420px', background: 'linear-gradient(180deg, #E4EEFF, #A9C4FF)', border: 'none',
    borderRadius: '4px', padding: '15px', color: '#0B1430', fontSize: '15px', fontWeight: '800', cursor: 'pointer',
  },
  shopGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: '10px', width: '100%', marginTop: '14px',
  },
  shopCard: {
    position: 'relative', padding: '10px', borderRadius: '4px', boxSizing: 'border-box',
    backgroundColor: 'rgba(40,62,130,0.45)', border: '1px solid rgba(160,190,255,0.25)',
  },
  priceTag: { position: 'absolute', top: '14px', right: '16px', fontSize: '13px', fontWeight: '800', color: '#FBBF24' },
  thumbImg: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' },
  thumb: {
    position: 'relative', overflow: 'hidden', height: '96px', borderRadius: '3px', marginBottom: '8px', fontSize: '42px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(160deg, rgba(130,160,235,0.4), rgba(25,40,100,0.7))',
  },
  qtyRow: { display: 'flex', gap: '6px', marginBottom: '8px' },
  qtyBtn: {
    width: '32px', border: '1px solid rgba(160,190,255,0.3)', borderRadius: '4px',
    backgroundColor: 'rgba(10,20,50,0.55)', color: '#FFFFFF', fontSize: '16px', fontWeight: '800', cursor: 'pointer',
  },
  qtyInput: {
    flex: 1, minWidth: 0, textAlign: 'center', padding: '7px 0', fontSize: '14px', fontWeight: '700',
    color: '#FFFFFF', backgroundColor: 'rgba(8,15,40,0.7)', border: '1px solid rgba(160,190,255,0.3)',
    borderRadius: '4px', outline: 'none',
  },
  buyBtn: {
    width: '100%', border: 'none', borderRadius: '4px', padding: '10px 6px', color: '#0B1430',
    fontSize: '12px', fontWeight: '800', background: 'linear-gradient(180deg, #E4EEFF, #A9C4FF)',
  },
  logoutBtn: {
    backgroundColor: 'transparent', border: '1px solid rgba(160,190,255,0.3)', color: '#CFE0FF',
    padding: '5px 12px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer',
  },
  resultBox: {
    width: '100%', maxWidth: '420px', padding: '13px', backgroundColor: 'rgba(8,15,40,0.7)', border: '1px solid',
    borderRadius: '4px', textAlign: 'center', fontSize: '13px', fontWeight: '700',
    marginTop: '14px', boxSizing: 'border-box', animation: 'fadeUp .3s ease both',
  },
  historyRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px',
    padding: '12px', marginBottom: '8px', backgroundColor: 'rgba(40,62,130,0.4)',
    border: '1px solid rgba(160,190,255,0.22)', borderRadius: '4px', fontSize: '13px',
  },
};
