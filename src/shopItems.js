// 상점 아이템 목록 - 클라이언트에서 아이템을 고칠 때는 이 파일만 고치면 됩니다.
//
// ★ id 는 한 번 정하면 바꾸지 마세요. (보유 아이템·내역이 id 로 저장됩니다)
//   이름(name)·설명(desc)·이미지(img)는 언제든 자유롭게 바꿔도 됩니다.
// ★ 가격(price)을 바꾸거나 아이템을 추가하면 firestore.rules 맨 위의 prices() 도 같은 값으로 고치세요.
//
// img: public/images 폴더에 넣은 파일 이름 (파일이 없으면 icon 이모지가 대신 보입니다)
export const SHOP_ITEMS = [
  { id: 'item_01', name: '테스트템1', price: 500, desc: '아이템 설명 적는 곳.', img: 'item1.png', icon: '🎁' },
  { id: 'item_02', name: '테스트템2', price: 1200, desc: '아이템 설명 적는 곳.', img: 'item2.png', icon: '🎁' },
  { id: 'item_03', name: '테스트템3', price: 300, desc: '아이템 설명 적는 곳.', img: 'item3.png', icon: '🎁' },
];

const BY_ID = Object.fromEntries(SHOP_ITEMS.map((i) => [i.id, i]));

// 저장된 키(id) → 화면에 보여줄 이름. 예전 기록(이름으로 저장된 것)은 그대로 보여줍니다.
export const itemLabel = (key) => (BY_ID[key] ? BY_ID[key].name : key);
