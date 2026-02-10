---
title: 'Genie: Generative Interactive Environments'
date: 2026-01-22 17:29:00 +0900
last_modified_at: '2026-01-23'
categories:
  - World Model
---



## 논문 선정 이유

---

World model 스터디 논문

[https://deepmind.google/blog/genie-3-a-new-frontier-for-world-models/](https://deepmind.google/blog/genie-3-a-new-frontier-for-world-models/)

구글 딥마인드!

단일 이미지나 text prompt, sketch로 action-controllable virtual world를 만들 수 있음


## Methods

---


일반적인 RL 모델 → 명시적인 action label이 데이터에 포함되어 있어야 학습 가능

but 온라인의 수많은 영상 데이터에는 어떤 action을 했는지에 대한 정보 부재


![notion-image-1770724137187-2tp3bk.png](/assets/images/notion-image-1770724137187-2tp3bk.png)

Latent action model로 action a 추론 + video tokenizer로 프레임을 개별 토큰 z로 변환

→ dynamics model로 다음 프레임 예측

자세한건 아래에..


### **Spatiotemporal(ST) transformers**

- model component 핵심 요소
- 거의 모든 구성요소에 이 ST transformer가 들어감
![notion-image-1770724138871-t367ue.png](/assets/images/notion-image-1770724138871-t367ue.png)

- T동안 H x W 개의 프레임이 쌓임. 이걸 Token으로 쪼개서 모델에 넣음
- 그럼 이 token들을 각각 spatial/temporal하게 attn 진행
- spatial: 공간적 attn, 한 프레임 내의 object 간의 관계
- temporal: 시간적 attn, 서로 다른 프레임의 object 간의 관계
- 이 attn들을 통해 모은 정보를 1개의 FFN을 거쳐 통합
- 원래는 공간/시간 각각 FFN 거쳐야 되는데 1개만 사용해서 모델 더 가벼워짐 
- 최종적으로 다음 프레임에 올 토큰이 뭔지를 예측
- 왜 이런 구조? 
- 공간/시간을 따로 계산하면 성능은 유지하면서 더 빠르고 효율적임


### **Latent Action Model(LAM)**

- 연속된 두 프레임 t, t+1을 관찰
- 다음 프레임 x_{t+1}을 예측할 때 이전 프레임 t에서 어떤 action이 취해졌는지를 condition으로 줌
- x_{1:t}(지금까지의 모든 프레임)과 바로 다음 프레임 x_{t+1}을 비교해서 encoder를 통과 → 사이의 변화를 설명하는 latent action 집합 \tilde{a}_{1:t}가 나옴
- x_{1:t}와 latent action a를 decoder에 입력하면 예측된 다음 프레임 값인 \hat{x}_{t+1}이 출력
- 예측 x와 실제 x 간의 Reconstruction loss를 Minimize

![notion-image-1770724141748-n1dv1l.png](/assets/images/notion-image-1770724141748-n1dv1l.png)

- 근데 inference 때는 저 LAM(encoder+decoder)를 다 버림
- why? 어차피 실제 게임 상황에서는 다음 프레임이 없음
- 그래서 decoder도 학습이 잘 됐는지 확인하기 위한 용도로만 존재
- 그럼 그 자리에 뭘 넣지
- actions from the user(키보드 조작 .. .etc)
- latent action a를 사용자의 행동 a로 대체
- [프레임 t] + [**사용자가 누른 버튼 a**] → [프레임 t+1 생성]
- 엥 근데 encoder를 버렸는데 어떻게 다음 프레임을 생성하지? → dynamics model
- VQ codebook은 남겨 둠
- Vector Quantization Codebook
- 영상 속 움직임은 복잡하고 continuous data이기 때문에 모델이 이해할 수 있는 discrete 입력으로 바꿔줘야 함
- 움직임 정보를 정해진 개수의 Index(=8)로 변환(0번=오른쪽으로 가속, 1번=수직 점프…)


### **Video Tokenizer**


![notion-image-1770724147992-ts0qtm.png](/assets/images/notion-image-1770724147992-ts0qtm.png)


차원을 줄이고(비디오 용량 너무 큼) 더 높은 품질의 video를 생성하기 위해 video를 discrete한 token으로 압축

- VQ-VAE 사용
- x_{1:T}가 input으로 들어가면 z_{1:T}라는 각 프레임에 대한 discrete representation을 생성
- T: time step
- 기존에는 spatial-only로 압축했지만, encoder/decoder에 모두 st-transformer를 사용해 temporal dynamics 정보까지 토큰에 녹여냄 → 생성 품질 상승
- 기존 모델은 계산 비용이 N^2으로 늘어났지만 여기서는 N으로 늘어남 → 계산비용 효율적

### **Dynamics Model**

![notion-image-1770724148917-9ober.png](/assets/images/notion-image-1770724148917-9ober.png)

**Decoder-only MaskGIT transformer** 구조

- *MaskGIT: 이미지/비디오의 일부를 masking하고 가려진 부분을 채우는 형태로 데이터 생성하는 모델*
- ST-transformer 구조 사용해서 비디오의 spatial/temporal 정보 동시 처리
- input: LAM model의 action & video tokenizer의 z
- output: 바로 다음 프레임의 토큰 z 예측
- cross-entropy로 z 차이 Minimize
- 학습 때 input token z를 베르누이 분포에 따라 0.5~1 사이에서 균일하게 샘플링해 무작위로 마스킹
- action data를 단순히 concat하지 않고 모델의 embedding에 더해주는 방법을 이용해서 user action에 더 민감하게 반응하도록 설계


### Inference: Action-Controllable Video Generation

![notion-image-1770724150339-7b3ruq.png](/assets/images/notion-image-1770724150339-7b3ruq.png)

- frame x_1을 모델에 입력 → tokenize되어 z_1
- [0, |A|) 내의 정수 값을 선택해 수행할 latent action a_1을 지정 → VQ codebook에서 인덱싱해서 \tilde{a}_1
- Dynamics model이 z_1, \tilde{a}_1 을 사용하여 다음 프레임 토큰 \hat{z}_2 예측
이걸 autoregressive하게 반복 …


모델을 두가지 방식으로 사용할 수 있음

1. Re-generation: 실제 영상을 시작 프레임+action 써서 다시 만들어보기
1. New Trajectories: 새로운 action을 넣으면 완전히 새로운 플레이 영상을 만들어냄





## Experiments

---



### Qualitative Results

이미지 프롬프트 플레이 예시


![notion-image-1770724153858-1yi233.png](/assets/images/notion-image-1770724153858-1yi233.png)


imagen2로 생성한 결과→ 배경은 거의 움직임 X 

![notion-image-1770724155368-fmv6jr.png](/assets/images/notion-image-1770724155368-fmv6jr.png)

![notion-image-1770724156682-ql933l.png](/assets/images/notion-image-1770724156682-ql933l.png)

서로 다른 프레임에서 시작했을 때 trajectory 예시

![notion-image-1770724158728-55373q.png](/assets/images/notion-image-1770724158728-55373q.png)

deformable object 예시







