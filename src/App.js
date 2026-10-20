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

// 하루에 주어지는 동전 던지기 횟수
const DAILY_GAMES = 5;

// 오늘 날짜 문자열 (예: 2026-10-20) - 한국 시간(KST) 기준
const getTodayString = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

// 전역 CSS (폰트, 애니메이션)
const globalCss = `
@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css');
body { margin: 0; background: #0A0A0B; }
* { font-family: 'Pretendard', -apple-system, 'Segoe UI', 'Noto Sans KR', sans-serif; }
@keyframes coinSpin {
  0%   { transform: perspective(600px) rotateY(0deg) translateY(0); }
  50%  { transform: perspective(600px) rotateY(900deg) translateY(-44px); }
  100% { transform: perspective(600px) rotateY(1800deg) translateY(0); }
}
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
.coin-flip { animation: coinSpin 0.8s ease-in-out; }
button { transition: transform .12s ease, filter .12s ease; }
button:not(:disabled):hover { filter: brightness(1.1); }
button:not(:disabled):active { transform: scale(.97); }
input:focus, select:focus { border-color: #C6FF3D !important; }
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
    { id: 'item_01', name: '테스트템1', price: 500, desc: '아이템 설명 적는 곳.' },
    { id: 'item_02', name: '테스트템2', price: 1200, desc: '아이템 설명 적는 곳.' },
    { id: 'item_03', name: '테스트템3', price: 300, desc: '아이템 설명 적는 곳.' },
  ];

  // 한글 아이디를 이메일 형식으로 변환
  const getFakeEmail = (id) => `${encodeURIComponent(id.trim())}@mygame.com`;

  // 로그인 상태 감지 및 DB 조회 (없으면 자동 생성)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        try {
          const userDocRef = doc(db, 'users', currentUser.uid);
          const userDoc = await getDoc(userDocRef);
          
          const displayId = currentUser.email ? decodeURIComponent(currentUser.email.split('@')[0]) : '';

          const today = getTodayString();

          if (userDoc.exists()) {
            const data = userDoc.data();
            setGold(data.gold ?? 1000);
            setInventory(toInv(data.inventory));

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
    if (betAmount <= 0 || betAmount > gold) {
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
      
      setCurrentCoinDisplay(coinResult === 'front' ? 'FRONT' : 'BACK');

      let newGold = gold;
      if (isWin) {
        const winGold = betAmount;
        newGold += winGold * 2;
        setResultMessage(`🎉 축하합니다! 동전은 [${sideName}]이었습니다. +${winGold * 2} 골드 획득!`);
        setResultType('win');
      } else {
        newGold -= betAmount;
        setResultMessage(`💀 아쉽네요! 동전은 [${sideName}]이었습니다. -${betAmount} 골드`);
        setResultType('lose');
      }

      const today = getTodayString();
      const newRemainingGames = currentRemaining - 1;

      setGold(newGold);
      setRemainingGames(newRemainingGames);
      setLastPlayDate(today);
      setIsFlipping(false);

      if (user) {
        const userDocRef = doc(db, 'users', user.uid);
        const displayId = user.email ? decodeURIComponent(user.email.split('@')[0]) : '';
        await setDoc(userDocRef, {
          userId: displayId,
          gold: newGold,
          remainingGames: newRemainingGames,
          lastPlayDate: today
        }, { merge: true });
      }
    }, 800);
  };

  // 아이템 구매 로직
  const handleBuyItem = async (item) => {
    if (gold < item.price) {
      alert('골드가 부족합니다!');
      return;
    }


    const newGold = gold - item.price;
    const newInventory = { ...inventory, [item.name]: (inventory[item.name] || 0) + 1 };

    setGold(newGold);
    setInventory(newInventory);

    if (user) {
      const userDocRef = doc(db, 'users', user.uid);
      const displayId = user.email ? decodeURIComponent(user.email.split('@')[0]) : '';
      await setDoc(userDocRef, {
        userId: displayId,
        gold: newGold,
        inventory: newInventory
      }, { merge: true });
      alert(`[${item.name}]을(를) 성공적으로 구매하셨습니다!`);
    }
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

    if (transferAmount <= 0 || transferAmount > gold) {
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

      await runTransaction(db, async (transaction) => {
        const myDoc = await transaction.get(myDocRef);
        if (!myDoc.exists()) throw new Error("내 계정 정보를 찾을 수 없습니다.");

        const myData = myDoc.data();
        if ((myData.gold ?? 0) < transferAmount) {
          throw new Error("골드가 부족합니다.");
        }

        const targetData = targetDoc.data();
        const newMyGold = (myData.gold ?? 0) - transferAmount;
        const newTargetGold = (targetData.gold ?? 0) + transferAmount;

        transaction.update(myDocRef, { gold: newMyGold });
        transaction.update(targetDocRef, { gold: newTargetGold });
        transaction.set(doc(collection(db, 'transfers')), {
          type: 'gold',
          fromUid: user.uid,
          fromId: currentDisplayId,
          toUid: targetDoc.id,
          toId: cleanTargetId,
          amount: transferAmount,
          createdAt: serverTimestamp()
        });

        setGold(newMyGold);
      });

      alert(`[${cleanTargetId}] 님에게 ${transferAmount.toLocaleString()} G를 성공적으로 전달했습니다!`);
      setTargetUserId('');
    } catch (error) {
      console.error("골드 양도 실패:", error);
      alert(`골드 양도 실패: ${error.message}`);
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

        setInventory(newMyInv);
      });

      alert(`[${cleanTargetId}] 님에게 [${selectedItemToTransfer}] 아이템을 전달했습니다!`);
      setTargetItemUserId('');
      setSelectedItemToTransfer('');
    } catch (error) {
      console.error("아이템 양도 실패:", error);
      alert(`아이템 양도 실패: ${error.message}`);
    }
  };

  // 양도 내역
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadHistory = async () => {
    if (!user) return;
    setHistoryLoading(true);
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
    }
    setHistoryLoading(false);
  };

  useEffect(() => {
    if (activeTab === 'transfer' && transferType === 'history') loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, transferType, user]);

  const hasItems = Object.values(inventory).some((c) => c > 0);
  const displayUserId = user && user.email ? decodeURIComponent(user.email.split('@')[0]) : '플레이어';

  if (loading) {
    return <div style={{ color: '#fff', textAlign: 'center', marginTop: '50px' }}>로딩 중...</div>;
  }

  // 로그인 화면
  if (!user) {
    return (
      <div style={styles.container}>
      <style>{globalCss}</style>
        <div style={styles.gameCard}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🎲</div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '4px' }}>카지노 로그인</h1>
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
    <div style={styles.container}>
      <style>{globalCss}</style>
      {/* 상단 프로필 영역 */}
      <div style={{ width: '100%', maxWidth: '380px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <span style={{ fontSize: '13px', color: '#8A8A93' }}>
          접속 계정: <strong style={{ color: '#FBBF24' }}>{displayUserId}</strong>
        </span>
        <button onClick={handleLogout} style={styles.logoutBtn}>로그아웃</button>
      </div>

      {/* 보유 골드 & 인벤토리 대시보드 */}
      <div style={styles.dashboardCard}>
        <div style={styles.goldText}>
          보유 골드: <span style={{ color: '#FBBF24', fontSize: '34px', fontWeight: '800' }}>{gold.toLocaleString()} G</span>
        </div>
        <div style={{ fontSize: '12px', color: '#9A9AA3', marginTop: '6px' }}>
          🎒 보유 아이템: {invText(inventory)}
        </div>
      </div>

      {/* 메뉴 탭 */}
      <div style={styles.tabGroup}>
        <button
          onClick={() => setActiveTab('game')}
          style={{
            ...styles.tabBtn,
            backgroundColor: activeTab === 'game' ? 'rgba(198,255,61,0.12)' : '#1B1B1F',
            color: activeTab === 'game' ? '#C6FF3D' : '#8A8A93',
          }}
        >
          🎲 게임
        </button>
        <button
          onClick={() => setActiveTab('shop')}
          style={{
            ...styles.tabBtn,
            backgroundColor: activeTab === 'shop' ? 'rgba(198,255,61,0.12)' : '#1B1B1F',
            color: activeTab === 'shop' ? '#C6FF3D' : '#8A8A93',
          }}
        >
          🛒 상점
        </button>
        <button
          onClick={() => setActiveTab('transfer')}
          style={{
            ...styles.tabBtn,
            backgroundColor: activeTab === 'transfer' ? 'rgba(198,255,61,0.12)' : '#1B1B1F',
            color: activeTab === 'transfer' ? '#C6FF3D' : '#8A8A93',
          }}
        >
          💸 양도
        </button>
      </div>

      {/* TAB 1: 게임 */}
      {activeTab === 'game' && (
        <div style={styles.gameCard}>
          <div style={styles.gameTitle}>[ 동전 던지기 ]</div>

          <div style={{
            fontSize: '13px',
            fontWeight: 'bold',
            marginBottom: '4px',
            color: currentRemaining > 0 ? '#C6FF3D' : '#FF4D6D',
          }}>
            🎟️ 오늘 남은 횟수: {currentRemaining}회
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
                backgroundColor: selectedChoice === 'front' ? 'rgba(198,255,61,0.12)' : '#1B1B1F',
                borderColor: selectedChoice === 'front' ? '#C6FF3D' : '#26262B',
              }}
            >
              ☀️ 앞면 (해)
            </button>
            <button
              onClick={() => { setSelectedChoice('back'); setCurrentCoinDisplay('BACK'); }}
              style={{
                ...styles.choiceBtn,
                backgroundColor: selectedChoice === 'back' ? 'rgba(198,255,61,0.12)' : '#1B1B1F',
                borderColor: selectedChoice === 'back' ? '#C6FF3D' : '#26262B',
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
        <div style={styles.gameCard}>
          <div style={styles.gameTitle}>[ 아이템 상점 ]</div>
          <p style={styles.subText}>골드를 사용하여 필요한 아이템을 구매하세요</p>

          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
            {shopItems.map((item) => {
              const owned = inventory[item.name] || 0;
              const cantBuy = gold < item.price;
              return (
                <div key={item.id} style={styles.itemCard}>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '15px' }}>{item.name}</div>
                    <div style={{ fontSize: '11px', color: '#9CA3AF' }}>{item.desc}</div>
                    <div style={{ fontSize: '13px', color: '#FBBF24', fontWeight: 'bold', marginTop: '4px' }}>
                      {item.price.toLocaleString()} G<span style={{ color: '#8A8A93', fontWeight: 'normal', marginLeft: '6px' }}>· 보유 {owned}개</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleBuyItem(item)}
                    disabled={cantBuy}
                    style={{
                      ...styles.buyBtn,
                      backgroundColor: cantBuy ? '#2A2A30' : '#C6FF3D',
                      color: cantBuy ? '#8A8A93' : '#0A0A0B',
                      cursor: cantBuy ? 'not-allowed' : 'pointer',
                    }}
                  >
                    구매
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: 양도 센터 */}
      {activeTab === 'transfer' && (
        <div style={styles.gameCard}>
          <div style={styles.gameTitle}>[ 양도 센터 ]</div>

          <div style={{ display: 'flex', gap: '6px', width: '100%', marginBottom: '16px' }}>
            <button
              onClick={() => setTransferType('gold')}
              style={{
                ...styles.subTabBtn,
                backgroundColor: transferType === 'gold' ? 'rgba(198,255,61,0.12)' : '#1B1B1F',
                color: transferType === 'gold' ? '#C6FF3D' : '#8A8A93',
              }}
            >
              💰 골드 양도
            </button>
            <button
              onClick={() => setTransferType('item')}
              style={{
                ...styles.subTabBtn,
                backgroundColor: transferType === 'item' ? 'rgba(198,255,61,0.12)' : '#1B1B1F',
                color: transferType === 'item' ? '#C6FF3D' : '#8A8A93',
              }}
            >
              🎒 아이템 양도
            </button>
            <button
              onClick={() => setTransferType('history')}
              style={{
                ...styles.subTabBtn,
                backgroundColor: transferType === 'history' ? 'rgba(198,255,61,0.12)' : '#1B1B1F',
                color: transferType === 'history' ? '#C6FF3D' : '#8A8A93',
              }}
            >
              📜 내역
            </button>
          </div>

          {transferType === 'history' && (
            <div style={{ width: '100%' }}>
              {historyLoading ? (
                <p style={{ ...styles.subText, textAlign: 'center' }}>불러오는 중...</p>
              ) : history.length === 0 ? (
                <p style={{ ...styles.subText, textAlign: 'center' }}>양도 내역이 없습니다.</p>
              ) : (
                history.map((h) => {
                  const sent = h.fromUid === user.uid;
                  const what = h.type === 'gold' ? `${(h.amount || 0).toLocaleString()} G` : `${h.item} ×1`;
                  const when = h.createdAt?.toDate
                    ? h.createdAt.toDate().toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : '';
                  return (
                    <div key={h.id} style={styles.historyRow}>
                      <div>
                        <div style={{ fontWeight: '700', color: sent ? '#FF4D6D' : '#C6FF3D' }}>
                          {sent ? `→ ${h.toId}에게 보냄` : `← ${h.fromId}에게 받음`}
                        </div>
                        <div style={{ fontSize: '11px', color: '#8A8A93', marginTop: '2px' }}>{when}</div>
                      </div>
                      <div style={{ fontWeight: '800' }}>{sent ? '-' : '+'}{what}</div>
                    </div>
                  );
                })
              )}
            </div>
          )}

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
                <label style={{ fontSize: '12px', color: '#9CA3AF', display: 'block', marginBottom: '4px' }}>보낼 골드 수량</label>
                <input
                  type="number"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(Number(e.target.value))}
                  style={styles.input}
                />
              </div>

              <button type="submit" style={styles.actionBtn}>
                골드 전달하기
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

const card = {
  backgroundColor: '#141416',
  border: '1px solid #26262B',
};

const styles = {
  container: {
    minHeight: '100vh', backgroundColor: '#0A0A0B', color: '#F5F5F7',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '24px 16px 110px', boxSizing: 'border-box',
  },
  dashboardCard: {
    ...card, width: '100%', maxWidth: '380px', borderRadius: '20px', padding: '22px',
    marginBottom: '16px', textAlign: 'center', boxSizing: 'border-box',
  },
  goldText: { fontSize: '13px', color: '#8A8A93', fontWeight: '600' },
  tabGroup: {
    position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
    width: '100%', maxWidth: '440px', display: 'flex', gap: '8px', zIndex: 10,
    padding: '10px 12px calc(10px + env(safe-area-inset-bottom, 0px))',
    backgroundColor: '#0A0A0B', borderTop: '1px solid #26262B', boxSizing: 'border-box',
  },
  tabBtn: {
    flex: 1, padding: '13px 0', borderRadius: '14px', border: '1px solid transparent',
    fontWeight: '700', fontSize: '13px', cursor: 'pointer',
  },
  subTabBtn: {
    flex: 1, padding: '10px 0', borderRadius: '10px', border: '1px solid #26262B',
    fontWeight: '700', fontSize: '12px', cursor: 'pointer',
  },
  gameCard: {
    ...card, width: '100%', maxWidth: '380px', borderRadius: '20px', padding: '26px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', boxSizing: 'border-box',
    animation: 'fadeUp .3s ease both',
  },
  gameTitle: { fontSize: '18px', fontWeight: '800', marginBottom: '8px', color: '#F5F5F7' },
  subText: { fontSize: '12px', color: '#8A8A93' },
  subtitle: { fontSize: '13px', color: '#8A8A93', marginBottom: '22px' },
  coinCircle: {
    width: '112px', height: '112px', borderRadius: '50%', backgroundColor: '#F5C451',
    border: '6px solid #E0A82E', boxShadow: 'inset 0 0 0 5px rgba(255,255,255,0.3)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '46px', margin: '20px 0', boxSizing: 'border-box',
  },
  buttonGroup: { display: 'flex', gap: '10px', width: '100%', marginTop: '8px', marginBottom: '16px' },
  choiceBtn: {
    flex: 1, padding: '13px', borderRadius: '12px', color: '#F5F5F7',
    fontWeight: '700', border: '1.5px solid #26262B', cursor: 'pointer', fontSize: '13px',
  },
  input: {
    width: '100%', backgroundColor: '#0A0A0B', border: '1px solid #26262B',
    borderRadius: '12px', padding: '14px', color: '#F5F5F7', fontSize: '16px',
    fontWeight: '700', textAlign: 'center', boxSizing: 'border-box', outline: 'none',
  },
  actionBtn: {
    width: '100%', backgroundColor: '#C6FF3D', border: 'none', borderRadius: '12px',
    padding: '15px', color: '#0A0A0B', fontSize: '15px', fontWeight: '800', cursor: 'pointer',
  },
  buyBtn: {
    border: 'none', borderRadius: '10px', padding: '10px 16px', color: '#0A0A0B',
    fontSize: '12px', fontWeight: '800',
  },
  logoutBtn: {
    backgroundColor: 'transparent', border: '1px solid #26262B', color: '#8A8A93',
    padding: '5px 12px', borderRadius: '8px', fontSize: '11px', cursor: 'pointer',
  },
  resultBox: {
    width: '100%', padding: '13px', backgroundColor: '#0A0A0B', border: '1px solid',
    borderRadius: '12px', textAlign: 'center', fontSize: '13px', fontWeight: '700',
    marginTop: '14px', boxSizing: 'border-box', animation: 'fadeUp .3s ease both',
  },
  historyRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px',
    padding: '12px', marginBottom: '8px', backgroundColor: '#1B1B1F',
    border: '1px solid #26262B', borderRadius: '12px', fontSize: '13px',
  },
  itemCard: {
    width: '100%', backgroundColor: '#1B1B1F', border: '1px solid #26262B',
    borderRadius: '14px', padding: '14px', display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', boxSizing: 'border-box',
  },
};
