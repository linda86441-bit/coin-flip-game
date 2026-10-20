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

  // 상점 아이템 목록
  const shopItems = [
    { id: 'item_01', name: '철릭', price: 500, desc: '전통 무관의 멋진 의복입니다.' },
    { id: 'item_02', name: '쌍륙 판', price: 1200, desc: '전통 보드게임용 판입니다.' },
    { id: 'item_03', name: '손전등', price: 300, desc: '어두운 곳을 밝히는 도구입니다.' },
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

          if (userDoc.exists()) {
            const data = userDoc.data();
            setGold(data.gold ?? 1000);
            setRemainingGames(data.remainingGames ?? 5);
            setInventory(data.inventory ?? []);
          } else {
            // 문서가 없으면 기본값으로 자동 생성
            await setDoc(userDocRef, {
              userId: displayId,
              gold: 1000,
              remainingGames: 5,
              inventory: []
            });
            setGold(1000);
            setRemainingGames(5);
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
    if (remainingGames <= 0) {
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

      const newRemainingGames = remainingGames - 1;

      setGold(newGold);
      setRemainingGames(newRemainingGames);
      setIsFlipping(false);

      if (user) {
        const userDocRef = doc(db, 'users', user.uid);
        const displayId = user.email ? decodeURIComponent(user.email.split('@')[0]) : '';
        await setDoc(userDocRef, {
          userId: displayId,
          gold: newGold,
          remainingGames: newRemainingGames,
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
            backgroundColor: activeTab === 'game' ? '#7C3AED' : '#1E293B',
            color: activeTab === 'game' ? '#FFFFFF' : '#94A3B8',
          }}
        >
          🎲 게임
        </button>
        <button
          onClick={() => setActiveTab('shop')}
          style={{
            ...styles.tabBtn,
            backgroundColor: activeTab === 'shop' ? '#7C3AED' : '#1E293B',
            color: activeTab === 'shop' ? '#FFFFFF' : '#94A3B8',
          }}
        >
          🛒 상점
        </button>
        <button
          onClick={() => setActiveTab('transfer')}
          style={{
            ...styles.tabBtn,
            backgroundColor: activeTab === 'transfer' ? '#7C3AED' : '#1E293B',
            color: activeTab === 'transfer' ? '#FFFFFF' : '#94A3B8',
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
            ...styles.coinCircle,
            transform: isFlipping ? 'rotateY(720deg)' : 'none',
            transition: 'transform 0.8s ease-in-out'
          }}>
            {currentCoinDisplay === 'FRONT' ? '☀️' : '🌙'}
          </div>

          <p style={styles.subText}>선택하세요</p>
          <div style={styles.buttonGroup}>
            <button
              onClick={() => { setSelectedChoice('front'); setCurrentCoinDisplay('FRONT'); }}
              style={{
                ...styles.choiceBtn,
                backgroundColor: selectedChoice === 'front' ? '#7C3AED' : '#374151',
                borderColor: selectedChoice === 'front' ? '#A78BFA' : 'transparent',
              }}
            >
              ☀️ 앞면 (해)
            </button>
            <button
              onClick={() => { setSelectedChoice('back'); setCurrentCoinDisplay('BACK'); }}
              style={{
                ...styles.choiceBtn,
                backgroundColor: selectedChoice === 'back' ? '#7C3AED' : '#374151',
                borderColor: selectedChoice === 'back' ? '#A78BFA' : 'transparent',
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
            disabled={isFlipping || remainingGames <= 0}
            style={{
              ...styles.actionBtn,
              opacity: (isFlipping || remainingGames <= 0) ? 0.5 : 1,
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
                backgroundColor: transferType === 'gold' ? '#3B82F6' : '#0F172A',
                color: transferType === 'gold' ? '#FFFFFF' : '#94A3B8',
              }}
            >
              💰 골드 양도
            </button>
            <button
              onClick={() => setTransferType('item')}
              style={{
                ...styles.subTabBtn,
                backgroundColor: transferType === 'item' ? '#3B82F6' : '#0F172A',
                color: transferType === 'item' ? '#FFFFFF' : '#94A3B8',
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

const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#0F172A',
    color: '#FFFFFF',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '24px 16px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  dashboardCard: {
    width: '100%', maxWidth: '380px', backgroundColor: '#1E293B',
    borderRadius: '16px', padding: '16px', marginBottom: '16px',
    border: '1px solid #334155', textAlign: 'center', boxSizing: 'border-box',
  },
  goldText: { fontSize: '16px' },
  tabGroup: {
    display: 'flex', gap: '8px', width: '100%', maxWidth: '380px', marginBottom: '16px',
  },
  tabBtn: {
    flex: 1, padding: '10px 0', borderRadius: '10px', border: '1px solid #334155',
    fontWeight: 'bold', fontSize: '13px', cursor: 'pointer',
  },
  subTabBtn: {
    flex: 1, padding: '8px 0', borderRadius: '8px', border: '1px solid #334155',
    fontWeight: 'bold', fontSize: '12px', cursor: 'pointer',
  },
  gameCard: {
    width: '100%', maxWidth: '380px', backgroundColor: '#1E293B',
    borderRadius: '16px', padding: '24px', border: '1px solid #334155',
    display: 'flex', flexDirection: 'column', alignItems: 'center', boxSizing: 'border-box',
  },
  gameTitle: { fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' },
  subText: { fontSize: '12px', color: '#94A3B8' },
  coinCircle: {
    width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#F59E0B',
    border: '4px solid #FCD34D', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '36px', margin: '16px 0',
  },
  buttonGroup: { display: 'flex', gap: '10px', width: '100%', marginTop: '8px', marginBottom: '16px' },
  choiceBtn: {
    flex: 1, padding: '10px', borderRadius: '10px', color: '#FFFFFF',
    fontWeight: 'bold', border: '2px solid transparent', cursor: 'pointer', fontSize: '13px',
  },
  input: {
    width: '100%', backgroundColor: '#0F172A', border: '1px solid #334155',
    borderRadius: '10px', padding: '12px', color: '#FFFFFF', fontSize: '15px',
    fontWeight: 'bold', textAlign: 'center', boxSizing: 'border-box', outline: 'none',
  },
  actionBtn: {
    width: '100%', background: 'linear-gradient(90deg, #EC4899 0%, #8B5CF6 100%)',
    border: 'none', borderRadius: '10px', padding: '12px', color: '#FFFFFF',
    fontSize: '15px', fontWeight: 'bold', cursor: 'pointer',
  },
  buyBtn: {
    border: 'none', borderRadius: '8px', padding: '8px 14px', color: '#FFFFFF',
    fontSize: '12px', fontWeight: 'bold',
  },
  logoutBtn: {
    backgroundColor: '#334155', border: 'none', color: '#CBD5E1', padding: '4px 10px',
    borderRadius: '6px', fontSize: '11px', cursor: 'pointer',
  },
  resultBox: {
    width: '100%', padding: '10px', backgroundColor: '#0F172A', border: '1px solid',
    borderRadius: '8px', textAlign: 'center', fontSize: '12px', fontWeight: 'bold',
    marginTop: '12px', boxSizing: 'border-box',
  },
  itemCard: {
    width: '100%', backgroundColor: '#0F172A', border: '1px solid #334155',
    borderRadius: '10px', padding: '12px', display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', boxSizing: 'border-box',
  },
};