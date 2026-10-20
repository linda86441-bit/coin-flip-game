import React, { useState, useEffect } from 'react';
import { 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

export default function App() {
  // 인증 및 유저 상태
  const [user, setUser] = useState(null);
  const [currentUserId, setCurrentUserId] = useState('');
  const [loading, setLoading] = useState(true);

  // 로그인 입력 상태
  const [inputId, setInputId] = useState('');
  const [inputPw, setInputPw] = useState('');

  // 게임 데이터 상태
  const [gold, setGold] = useState(1000);
  const [remainingGames, setRemainingGames] = useState(5);
  const maxGames = 5;

  const [selectedChoice, setSelectedChoice] = useState('front');
  const [betAmount, setBetAmount] = useState(100);
  const [isFlipping, setIsFlipping] = useState(false);
  const [currentCoinDisplay, setCurrentCoinDisplay] = useState('FRONT');
  const [resultMessage, setResultMessage] = useState('');
  const [resultType, setResultType] = useState('');

  // 로그인 상태 실시간 감지 및 Firestore에서 유저 데이터 불러오기
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        // DB에서 해당 유저의 골드와 남은 횟수 가져오기
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
          const data = userDoc.data();
          setGold(data.gold ?? 1000);
          setRemainingGames(data.remainingGames ?? 5);
          setCurrentUserId(data.userId || inputId || '플레이어');
        }
      } else {
        setUser(null);
        setCurrentUserId('');
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [inputId]);

  // 아이디를 가상 이메일로 변환하는 함수
  const getFakeEmail = (id) => `${id.trim()}@mygame.com`;

  // 로그인 처리 (회원가입 기능 제거됨)
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

  // 동전 던지기 게임 로직 및 Firestore에 골드 실시간 동기화
  const handleFlipCoin = async () => {
    if (remainingGames <= 0) {
      alert('오늘 남은 게임 횟수가 없습니다!');
      return;
    }
    if (betAmount <= 0 || betAmount > gold) {
      alert('베팅 금액을 다시 확인해 주세요. 보유 골드보다 높거나 0 이하일 수 없습니다.');
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

      // 상태 업데이트
      setGold(newGold);
      setRemainingGames(newRemainingGames);
      setIsFlipping(false);

      // Firebase 데이터베이스에 변경된 골드와 남은 횟수 저장
      if (user) {
        const userDocRef = doc(db, 'users', user.uid);
        await updateDoc(userDocRef, {
          gold: newGold,
          remainingGames: newRemainingGames,
        });
      }
    }, 800);
  };

  if (loading) {
    return <div style={{ color: '#fff', textAlign: 'center', marginTop: '50px' }}>로딩 중...</div>;
  }

  // 1. 로그아웃 상태일 때: 지정된 계정 전용 로그인 화면
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
                placeholder="아이디 입력"
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

          <p style={{ color: '#64748B', fontSize: '11px', marginTop: '16px' }}>
            * 계정 생성이 필요한 경우 관리자에게 문의하세요.
          </p>
        </div>
      </div>
    );
  }

  // 2. 로그인 성공 시: 동전 던지기 게임 화면
  return (
    <div style={styles.container}>
      <div style={{ width: '100%', maxWidth: '380px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <span style={{ fontSize: '13px', color: '#94A3B8' }}>접속 계정: <strong style={{ color: '#FBBF24' }}>{currentUserId}</strong></span>
        <button onClick={handleLogout} style={styles.logoutBtn}>로그아웃</button>
      </div>

      <div style={styles.header}>
        <span style={{ fontSize: '28px' }}>🎲</span>
        <h1 style={styles.title}>카지노</h1>
      </div>
      <p style={styles.subtitle}>오늘의 운세는?</p>

      <div style={styles.dashboardCard}>
        <div style={styles.goldText}>
          보유 골드: <span style={{ color: '#FBBF24', fontSize: '22px', fontWeight: 'bold' }}>{gold.toLocaleString()} G</span>
        </div>
        <div style={styles.gridRow}>
          <div style={styles.gridItem}>
            <div style={{ color: '#34D399', fontSize: '20px', fontWeight: 'bold' }}>{remainingGames}</div>
            <div style={styles.subText}>남은 게임 횟수</div>
          </div>
          <div style={styles.gridItem}>
            <div style={{ color: '#9CA3AF', fontSize: '20px', fontWeight: 'bold' }}>{maxGames}</div>
            <div style={styles.subText}>일일 최대 게임</div>
          </div>
        </div>
      </div>

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
          <p style={{ textAlign: 'center', fontSize: '13px', color: '#C4B5FD', marginTop: '8px' }}>
            승리 시 획득: <strong style={{ color: '#FBBF24' }}>{(betAmount * 2).toLocaleString()}</strong> 골드
          </p>
        </div>

        <button
          onClick={handleFlipCoin}
          disabled={isFlipping || remainingGames <= 0}
          style={{
            ...styles.actionBtn,
            opacity: (isFlipping || remainingGames <= 0) ? 0.5 : 1,
            cursor: (isFlipping || remainingGames <= 0) ? 'not-allowed' : 'pointer',
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

        <div style={styles.ruleBox}>
          <h4 style={{ margin: '0 0 8px 0', color: '#E5E7EB', fontSize: '13px' }}>게임 규칙</h4>
          <ul style={{ margin: 0, paddingLeft: '18px', color: '#9CA3AF', fontSize: '12px', lineHeight: '1.6' }}>
            <li>앞면(☀️) 또는 뒷면(🌙)을 선택하세요.</li>
            <li>맞추면 베팅 금액의 2배를 획득합니다.</li>
            <li>틀리면 베팅 금액을 잃습니다.</li>
            <li>하루에 최대 5번까지 플레이 가능합니다.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// 스타일 모음
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
  header: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' },
  title: { fontSize: '28px', fontWeight: 'bold', margin: 0 },
  subtitle: { color: '#94A3B8', fontSize: '14px', marginBottom: '20px' },
  dashboardCard: {
    width: '100%', maxWidth: '380px', backgroundColor: '#1E293B',
    borderRadius: '16px', padding: '20px', marginBottom: '20px',
    border: '1px solid #334155', textAlign: 'center', boxSizing: 'border-box',
  },
  goldText: { fontSize: '18px', marginBottom: '16px' },
  gridRow: { display: 'flex', borderTop: '1px solid #334155', paddingTop: '12px' },
  gridItem: { flex: 1 },
  subText: { fontSize: '12px', color: '#94A3B8' },
  gameCard: {
    width: '100%', maxWidth: '380px', backgroundColor: '#1E293B',
    borderRadius: '16px', padding: '24px', border: '1px solid #334155',
    display: 'flex', flexDirection: 'column', alignItems: 'center', boxSizing: 'border-box',
  },
  gameTitle: { fontSize: '18px', fontWeight: 'bold', marginBottom: '20px' },
  coinCircle: {
    width: '90px', height: '90px', borderRadius: '50%', backgroundColor: '#F59E0B',
    border: '4px solid #FCD34D', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '42px', marginBottom: '20px', boxShadow: '0 0 20px rgba(245, 158, 11, 0.3)',
  },
  buttonGroup: { display: 'flex', gap: '10px', width: '100%', marginTop: '8px', marginBottom: '20px' },
  choiceBtn: {
    flex: 1, padding: '12px', borderRadius: '12px', color: '#FFFFFF',
    fontWeight: 'bold', border: '2px solid transparent', cursor: 'pointer', fontSize: '14px',
  },
  input: {
    width: '100%', backgroundColor: '#0F172A', border: '1px solid #334155',
    borderRadius: '12px', padding: '12px', color: '#FFFFFF', fontSize: '16px',
    fontWeight: 'bold', textAlign: 'center', boxSizing: 'border-box', outline: 'none',
  },
  actionBtn: {
    width: '100%', background: 'linear-gradient(90deg, #EC4899 0%, #8B5CF6 100%)',
    border: 'none', borderRadius: '12px', padding: '14px', color: '#FFFFFF',
    fontSize: '16px', fontWeight: 'bold', cursor: 'pointer',
  },
  logoutBtn: {
    backgroundColor: '#334155', border: 'none', color: '#CBD5E1', padding: '4px 10px',
    borderRadius: '6px', fontSize: '11px', cursor: 'pointer',
  },
  resultBox: {
    width: '100%', padding: '12px', backgroundColor: '#0F172A', border: '1px solid',
    borderRadius: '10px', textAlign: 'center', fontSize: '13px', fontWeight: 'bold',
    marginBottom: '16px', boxSizing: 'border-box',
  },
  ruleBox: {
    width: '100%', backgroundColor: '#0F172A', borderRadius: '12px', padding: '14px',
    border: '1px solid #334155', boxSizing: 'border-box',
  },
};