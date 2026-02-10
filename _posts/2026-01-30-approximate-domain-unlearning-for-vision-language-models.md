---
title: Approximate Domain Unlearning for Vision-Language Models
date: 2026-01-30 17:47:00 +0900
last_modified_at: '2026-02-06'
categories:
  - Computer Vision 
excerpt: "NeurIPS 2025 Spotlight"
---

>NeurIPS 2025 Spotlight. [[Paper]](https://arxiv.org/abs/2510.08132) [[Github]](https://github.com/kodaikawamura/domain-unlearning)  
>Kodai Kawamura, Yuta Goto, Rintaro Yanagi, Hirokatsu Kataoka, Go Irie


## 논문 선정 이유


Domain Generalization 연구 ing

새로운 문제 설정 → Approximate Domain Unlearning(ADU)

domain dist를 명시적으로 분리하는 loss 우리 연구에도 쓸 수 있지 않을까?



## Introduction

VLM은 뛰어난 generalization capability를 가지고 있음

→ but, 특정 downstream task에서는 모든 클래스를 식별할 필요가 없다

- e.g. 자율주행 시스템에서 보행자와 차는 구분해야 하지만 foods랑 groceries는 구분할 필요 X  
- 그래서 **approximate learning (selective forgetting)** 이라는 방법이 주목받게 됨

  - 특정 지식은 잊어버리고 나머지는 보존

지금까지는 잊어버릴 클래스에 대한 loss는 높이고 유지될 클래스에 대한 loss를 낮추는 방향으로 연구 진행

→ 그러나, 단순히 class를 잊어버리는 것이 real-world applications에서 효과적이지 않다. 

- e.g., 자율주행 시스템에서 간판의 차 그림이 실제 car로 인식되면 큰 위험

  ![notion-image-1770706547605-fni4gs.png](/assets/images/notion-image-1770706547605-fni4gs.png)

## Main Method

![notion-image-1770706549239-vs3lnr.png](/assets/images/notion-image-1770706549239-vs3lnr.png)


### Approximate Domain Unlearning

notation

- train data $\{(x,y,d)\}$
  - *x : input image*
  - *y: cls label*
  - *d: domain label*

- $D_{memorize}$ : presearved domain
- $D_{forget}$ : forgetten domain

일반적인 domain unlearning method는 다음 2가지 loss를 함께 사용함

1. 유지해야 할 클래스는 cross-entropy loss를 최소화  
   $$L_{memorize}(B) = -\frac{1}{|B|} \sum_{i=1}^{|B|} \sum_{j=1}^{|C|} y_{ij} \log p_{ij}$$

2. 잊어버려야 할 클래스는 분포를 uniform하게 만듦(=entropy 최대화)  
   $$L_{forget}(B) = -\frac{1}{|B|} \sum_{i=1}^{|B|} \sum_{j=1}^{|C|} \frac{1}{|C|} \log p_{ij}$$


→ 그러나, 이 2가지 Loss로는 이미 여러 domain에 걸쳐 강하게 align된 pre-trained VLM의 성능을 높이기에는 충분하지 않음


### Domain Disentangling Loss(DDL)

**idea** : domain 간 feature가 잘 분리되어 있으면 주어진, sample의 domain label d를 정확하게 맞힐 수 있다 & vice versa

1. CE Loss : label이 domain인 CE Loss를 통해 domain을 잘 맞히도록 학습  
   $$L_{CE}(B) = -\frac{1}{|B|} \sum_{i=1}^{|B|} \sum_{j=1}^{|D|} d_{ij} \log p_{ij}^d$$

2. MMD Loss : MMD(Maximum Mean Discrepancy) loss를 통해 분포 차이를 계산  
   - $\phi$ : kernel-induced feature mapping  
   $$MMD^2(B) = \frac{2}{|D|(|D|-1)} \sum_{1 \le d < d' \le |D|} \left\| \frac{1}{|B_d|} \sum_{x_i \in B_d} \phi(x_i) - \frac{1}{|B_{d'}|} \sum_{x_j \in B_{d'}} \phi(x_j) \right\|_H^2$$

3. Domain Loss: 이 MMD loss에 -를 붙여 최대화 → Intra-domain divergence를 maximize  
   $$L_{domain}(B) = \gamma L_{CE}(B) - \lambda MMD^2(B)$$

4. Total loss  
   $$L_{total}(B) = L_{memorize}(B) + L_{forget}(B) + L_{domain}(B)$$



### Instance-wise Prompt Generator(InstaPG)

기존 CLIP의 prompt는 domain에 대한 개념이 너무 ambiguous해서 이미지의 instance-wise한 변화를 설명할 수 X

→ 이미지마다 맞춤형 prompt를 만들자

![notion-image-1770706552207-37ok2y.png](/assets/images/notion-image-1770706552207-37ok2y.png)


- **Image Patch Features (Keys & Values)**: 현재 처리 중인 이미지의 패치

- **Learnable Vision Prompts (Queries)**: 우리가 기존에 가지고 있던 일반적인 도메인 프롬프트

- 이 Q, K, V끼리 **cross-attention**을 진행해 이미지의 어떤 부분을 더 볼지 결정

이 과정을 거치면 원래의 고정된 프롬프트가 현재 이미지의 특징을 반영하여 Instance-wise Prompt로 업데이트된다.


## Experiments


- Domain Unlearning이라는 task를 본 논문에서 처음 정의했기 때문에 existing method가 없음
  - 2가지 SOTA CLIP fine-tuning method인 LP++와 CLIPFit으로 평가

- **LP++(Linear Probing++)** : embedding에 직접적인 Linear transformation을 추가

- **CLIPFit** : 각 image/text encoder의 아주 작은 Param(약 1%)만 fine-tuning

- SOTA machine unlearning method인 BBF(Black-Box Forgetting)으로 평가

![notion-image-1770706555791-ttuqx9.png](/assets/images/notion-image-1770706555791-ttuqx9.png)


- $D_{forget}$: 잊혀질 domain의 수

  - ImageNet은 Domain이 2개이기 때문에 D=1만 실험

- ***Mem**** : 기억해야 할 domain의 정확도(높을수록 좋음)

- ***For**** : 잊어야 할 domain의 error

  - error가 높을수록 잘 잊혀짐 

- ***H**** : Mem과 For의 조화평균

  - 값이 높을수록 둘의 밸런스가 좋다


### Ablation Study

![notion-image-1770706558357-hufio.png](/assets/images/notion-image-1770706558357-hufio.png)

- DDL만 썼을 때보다 InstaPG를 같이 쓰면 성능이 더 향상됨

### Classification Accuracy

- 기본적으로 Domain이 잘 분리되어 있어야 효과적인 Unlearning이 가능
  
![notion-image-1770706559269-j69xfw.png](/assets/images/notion-image-1770706559269-j69xfw.png)


![notion-image-1770706560386-a6whtr.png](/assets/images/notion-image-1770706560386-a6whtr.png)

- attn map에서 잊혀져야 할 domain의 주의를 성공적으로 분산시킴.



## Limitations

real-world senario에서는 모든 sample에 domain label이 없을 수도 있음

→ domain estimation technique으로 해결 가능(clustering ??)

- 저자들이 appendix에서 pseudo labeling 실험 좀 해봤는데 잘됐다고 함




