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
  runTransaction 
} from 'firebase/firestore';
import { auth, db } from './firebase';

// 하루에 주어지는 동전 던지기 횟수
const DAILY_GAMES = 5;

// 오늘 날짜 문자열 (예: 2026-10-20) - 접속한 기기의 날짜 기준
const getTodayString = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// 전역 CSS (애니메이션, 호버 효과)
const globalCss = `
@keyframes coinSpin {
  0%   { transform: perspective(600px) rotateY(0deg) translateY(0); }
  50%  { transform: perspective(600px) rotateY(900deg) translateY(-44px); }
  100% { transform: perspective(600px) rotateY(1800deg) translateY(0); }
}
@keyframes glowPulse {
  0%, 100% { box-shadow: 0 0 22px rgba(251,191,36,.35), inset 0 0 14px rgba(255,255,255,.35); }
  50%      { box-shadow: 0 0 42px rgba(251,191,36,.75), inset 0 0 14px rgba(255,255,255,.35); }
}
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
.coin { animation: glowPulse 2.5s ease-in-out infinite; }
.coin-flip { animation: coinSpin 0.8s ease-in-out; }
.fade-up { animation: fadeUp .35s ease both; }
button { transition: transform .15s ease, filter .15s ease; }
button:not(:disabled):hover { transform: translateY(-2px); filter: brightness(1.12); }
button:not(:disabled):active { transform: translateY(0) scale(.98); }
input:focus, select:focus { border-color: #FBBF24 !important; box-shadow: 0 0 0 3px rgba(251,191,36,.2); }
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
  const [inventory, setInventory] = useState([]);
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
            setInventory(data.inventory ?? []);

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
              inventory: []
            });
            setGold(1000);
            setRemainingGames(DAILY_GAMES);
            setLastPlayDate(today);
            setInventory([]);
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
          lastPlayDate: today,
          inventory: inventory
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

    if (inventory.includes(item.name)) {
      alert('이미 보유하고 있는 아이템입니다.');
      return;
    }

    const newGold = gold - item.price;
    const newInventory = [...inventory, item.name];

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
        const myInv = myData.inventory ?? [];

        if (!myInv.includes(selectedItemToTransfer)) {
          throw new Error("보유하지 않은 아이템입니다.");
        }

        const targetData = targetDoc.data();
        const targetInv = targetData.inventory ?? [];

        const newMyInv = myInv.filter(item => item !== selectedItemToTransfer);
        const newTargetInv = targetInv.includes(selectedItemToTransfer) 
          ? targetInv 
          : [...targetInv, selectedItemToTransfer];

        transaction.update(myDocRef, { inventory: newMyInv });
        transaction.update(targetDocRef, { inventory: newTargetInv });

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
        <span style={{ fontSize: '13px', color: '#94A3B8' }}>
          접속 계정: <strong style={{ color: '#FBBF24' }}>{displayUserId}</strong>
        </span>
        <button onClick={handleLogout} style={styles.logoutBtn}>로그아웃</button>
      </div>

      {/* 보유 골드 & 인벤토리 대시보드 */}
      <div style={styles.dashboardCard}>
        <div style={styles.goldText}>
          보유 골드: <span style={{ color: '#FBBF24', fontSize: '22px', fontWeight: 'bold' }}>{gold.toLocaleString()} G</span>
        </div>
        <div style={{ fontSize: '12px', color: '#A78BFA', marginTop: '6px' }}>
          🎒 보유 아이템: {inventory.length > 0 ? inventory.join(', ') : '없음'}
        </div>
      </div>

      {/* 메뉴 탭 */}
      <div style={styles.tabGroup}>
        <button
          onClick={() => setActiveTab('game')}
          style={{
            ...styles.tabBtn,
            backgroundColor: activeTab === 'game' ? 'rgba(251,191,36,0.18)' : 'rgba(15,23,42,0.6)',
            color: activeTab === 'game' ? '#FBBF24' : '#94A3B8',
          }}
        >
          🎲 게임
        </button>
        <button
          onClick={() => setActiveTab('shop')}
          style={{
            ...styles.tabBtn,
            backgroundColor: activeTab === 'shop' ? 'rgba(251,191,36,0.18)' : 'rgba(15,23,42,0.6)',
            color: activeTab === 'shop' ? '#FBBF24' : '#94A3B8',
          }}
        >
          🛒 상점
        </button>
        <button
          onClick={() => setActiveTab('transfer')}
          style={{
            ...styles.tabBtn,
            backgroundColor: activeTab === 'transfer' ? 'rgba(251,191,36,0.18)' : 'rgba(15,23,42,0.6)',
            color: activeTab === 'transfer' ? '#FBBF24' : '#94A3B8',
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
            color: currentRemaining > 0 ? '#A78BFA' : '#EF4444',
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
                backgroundColor: selectedChoice === 'front' ? 'rgba(251,191,36,0.18)' : 'rgba(15,23,42,0.6)',
                borderColor: selectedChoice === 'front' ? '#FBBF24' : 'transparent',
              }}
            >
              ☀️ 앞면 (해)
            </button>
            <button
              onClick={() => { setSelectedChoice('back'); setCurrentCoinDisplay('BACK'); }}
              style={{
                ...styles.choiceBtn,
                backgroundColor: selectedChoice === 'back' ? 'rgba(251,191,36,0.18)' : 'rgba(15,23,42,0.6)',
                borderColor: selectedChoice === 'back' ? '#FBBF24' : 'transparent',
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
              const isBought = inventory.includes(item.name);
              return (
                <div key={item.id} style={styles.itemCard}>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '15px' }}>{item.name}</div>
                    <div style={{ fontSize: '11px', color: '#9CA3AF' }}>{item.desc}</div>
                    <div style={{ fontSize: '13px', color: '#FBBF24', fontWeight: 'bold', marginTop: '4px' }}>
                      {item.price.toLocaleString()} G
                    </div>
                  </div>
                  <button
                    onClick={() => handleBuyItem(item)}
                    disabled={isBought}
                    style={{
                      ...styles.buyBtn,
                      backgroundColor: isBought ? '#475569' : '#10B981',
                      cursor: isBought ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {isBought ? '구매완료' : '구매'}
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
                backgroundColor: transferType === 'gold' ? 'rgba(251,191,36,0.18)' : '#0F172A',
                color: transferType === 'gold' ? '#FBBF24' : '#94A3B8',
              }}
            >
              💰 골드 양도
            </button>
            <button
              onClick={() => setTransferType('item')}
              style={{
                ...styles.subTabBtn,
                backgroundColor: transferType === 'item' ? 'rgba(251,191,36,0.18)' : '#0F172A',
                color: transferType === 'item' ? '#FBBF24' : '#94A3B8',
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
                {inventory.length > 0 ? (
                  <select
                    value={selectedItemToTransfer}
                    onChange={(e) => setSelectedItemToTransfer(e.target.value)}
                    style={styles.input}
                  >
                    <option value="">-- 아이템을 선택하세요 --</option>
                    {inventory.map((itemName, index) => (
                      <option key={index} value={itemName}>
                        {itemName}
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
                disabled={inventory.length === 0}
                style={{
                  ...styles.actionBtn,
                  opacity: inventory.length === 0 ? 0.5 : 1,
                  cursor: inventory.length === 0 ? 'not-allowed' : 'pointer',
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
  backgroundColor: 'rgba(30,41,59,0.55)',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  border: '1px solid rgba(251,191,36,0.2)',
  boxShadow: '0 10px 40px rgba(0,0,0,0.45)',
};

const styles = {
  container: {
    minHeight: '100vh',
    background:
      'radial-gradient(circle at 15% 0%, rgba(124,58,237,0.35), transparent 45%), ' +
      'radial-gradient(circle at 90% 100%, rgba(236,72,153,0.25), transparent 40%), #070B16',
    color: '#FFFFFF',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '24px 16px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans KR", sans-serif',
  },
  dashboardCard: {
    ...card, width: '100%', maxWidth: '380px', borderRadius: '20px', padding: '18px',
    marginBottom: '16px', textAlign: 'center', boxSizing: 'border-box',
    border: '1px solid rgba(251,191,36,0.4)',
  },
  goldText: { fontSize: '15px', color: '#E2E8F0', letterSpacing: '0.5px' },
  tabGroup: { display: 'flex', gap: '8px', width: '100%', maxWidth: '380px', marginBottom: '16px' },
  tabBtn: {
    flex: 1, padding: '11px 0', borderRadius: '12px', border: '1px solid rgba(251,191,36,0.2)',
    fontWeight: 'bold', fontSize: '13px', cursor: 'pointer',
  },
  subTabBtn: {
    flex: 1, padding: '9px 0', borderRadius: '10px', border: '1px solid rgba(251,191,36,0.2)',
    fontWeight: 'bold', fontSize: '12px', cursor: 'pointer',
  },
  gameCard: {
    ...card, width: '100%', maxWidth: '380px', borderRadius: '20px', padding: '26px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', boxSizing: 'border-box',
    animation: 'fadeUp .35s ease both',
  },
  gameTitle: {
    fontSize: '20px', fontWeight: '800', marginBottom: '8px', letterSpacing: '2px',
    background: 'linear-gradient(90deg, #FDE68A, #FBBF24, #F472B6)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
  },
  subText: { fontSize: '12px', color: '#94A3B8' },
  subtitle: { fontSize: '13px', color: '#94A3B8', marginBottom: '20px' },
  coinCircle: {
    width: '96px', height: '96px', borderRadius: '50%',
    background: 'radial-gradient(circle at 30% 30%, #FEF3C7, #FBBF24 55%, #B45309)',
    border: '4px solid #FDE68A', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '42px', margin: '18px 0',
  },
  buttonGroup: { display: 'flex', gap: '10px', width: '100%', marginTop: '8px', marginBottom: '16px' },
  choiceBtn: {
    flex: 1, padding: '12px', borderRadius: '12px', color: '#FFFFFF',
    fontWeight: 'bold', border: '2px solid transparent', cursor: 'pointer', fontSize: '13px',
  },
  input: {
    width: '100%', backgroundColor: 'rgba(7,11,22,0.7)', border: '1px solid rgba(148,163,184,0.3)',
    borderRadius: '12px', padding: '13px', color: '#FFFFFF', fontSize: '15px',
    fontWeight: 'bold', textAlign: 'center', boxSizing: 'border-box', outline: 'none',
  },
  actionBtn: {
    width: '100%', background: 'linear-gradient(135deg, #FDE68A 0%, #FBBF24 45%, #D97706 100%)',
    border: 'none', borderRadius: '12px', padding: '14px', color: '#1F1300',
    fontSize: '15px', fontWeight: '800', letterSpacing: '1px', cursor: 'pointer',
    boxShadow: '0 6px 20px rgba(251,191,36,0.35)',
  },
  buyBtn: {
    border: 'none', borderRadius: '10px', padding: '9px 16px', color: '#FFFFFF',
    fontSize: '12px', fontWeight: 'bold',
  },
  logoutBtn: {
    backgroundColor: 'rgba(51,65,85,0.8)', border: '1px solid rgba(148,163,184,0.3)', color: '#CBD5E1',
    padding: '5px 12px', borderRadius: '8px', fontSize: '11px', cursor: 'pointer',
  },
  resultBox: {
    width: '100%', padding: '12px', backgroundColor: 'rgba(7,11,22,0.7)', border: '1px solid',
    borderRadius: '12px', textAlign: 'center', fontSize: '13px', fontWeight: 'bold',
    marginTop: '14px', boxSizing: 'border-box', animation: 'fadeUp .35s ease both',
  },
  itemCard: {
    width: '100%', backgroundColor: 'rgba(7,11,22,0.6)', border: '1px solid rgba(251,191,36,0.2)',
    borderRadius: '14px', padding: '14px', display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', boxSizing: 'border-box',
  },
};
