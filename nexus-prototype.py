# -*- coding: utf-8 -*-
"""
@author: spatika

NEXUS – PCA 2D Mapping Prototype
"""

import numpy as np
import matplotlib.pyplot as plt
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
from PIL import Image
import requests
from io import BytesIO
import colorsys
import warnings
warnings.filterwarnings("ignore")

from matplotlib.offsetbox import OffsetImage, AnnotationBbox
import matplotlib.patches as mpatches

print("NEXUS – PCA 2D Mapping Prototype)")
print("=" * 70)

"""
Importing Dataset from Firebase Storage (Users uploaded images to: https://spatikasam.github.io/nexus/)

The dataset includes...
- Colour Images of everyday objects
- Emotion label for each object -> each emotion is represented by a colour in 2D mapping later on
- Data is imported as (filename, emotion, url)
"""

FIREBASE_DATA = [
    ("IMG_1517.JPG", "sadness", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765882594985_IMG_1517.JPG?alt=media&token=8212445f-6a13-43ca-93eb-e55949f48719"),
    ("8339C270-3FA9-49CA-B68C-B837E0392D30.jpg", "disgust", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765882481709_8339C270-3FA9-49CA-B68C-B837E0392D30.jpg?alt=media&token=4d82af6f-a3bd-4095-b834-8f722e3a7f26"),
    ("IMG_1507.jpg", "surprise", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765882390981_IMG_1507.jpg?alt=media&token=6a3da49b-fb41-4845-920d-75cbf3d93f1d"),
    ("IMG_1143.jpg", "happiness", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765882365404_IMG_1143.jpg?alt=media&token=1d98b4d6-6d19-4904-b7e9-950bbaa40887"),
    ("IMG_1512.JPG", "happiness", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765882329421_IMG_1512.JPG?alt=media&token=1ba4f912-9e39-4d9e-9963-dcfc476040c9"),
    ("IMG_1142.jpg", "fear", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765882302920_IMG_1142.jpg?alt=media&token=95ed8b4e-9891-4098-ac80-52fb5428307a"),
    ("IMG_1508.jpg", "happiness", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765882290411_IMG_1508.jpg?alt=media&token=51b15905-5d3f-4c4a-a729-eb468dd345ff"),
    ("IMG_4493.JPG", "anger", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765882272187_IMG_4493.JPG?alt=media&token=ab2468e0-8286-41fd-8ca3-1e4ddfc75ce6"),
    ("IMG_3346.JPG", "disgust", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765882240366_IMG_3346.JPG?alt=media&token=edd8aeb3-7532-4a84-b196-49bc7c02dd1a"),
    ("IMG_6391.JPG", "surprise", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765882201035_IMG_6391.JPG?alt=media&token=c300faf3-c606-4f22-a4f0-60f65a231c5b"),
    ("IMG_7165.JPG", "sadness", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765882183289_IMG_7165.JPG?alt=media&token=e82ffabd-9320-4e63-8cd4-85dd7df5b37a"),
    ("IMG_1511.jpg", "disgust", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765882169517_IMG_1511.jpg?alt=media&token=f5716ae9-8d76-4333-970c-2b6a74fa90d9"),
    ("image.jpg", "anger", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765880491770_image.jpg?alt=media&token=b20fd17c-b982-4ef0-89ad-5d60c90eaf15"),
    ("image.jpg", "happiness", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765880453353_image.jpg?alt=media&token=3d457e5e-55e4-4de5-ba14-9d7b08c8061b"),
    ("image.jpg", "anger", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765880382500_image.jpg?alt=media&token=427d49e2-ed78-4b00-b1a8-df07e5af4d64"),
    ("image.jpg", "happiness", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765880320390_image.jpg?alt=media&token=c15cefd5-a022-404d-b5c3-8201c7c93c51"),
    ("image.jpg", "happiness", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765879727325_image.jpg?alt=media&token=f668090e-129d-484e-a5d5-a6293f9bfe64"),
    ("image.jpg", "happiness", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765879613351_image.jpg?alt=media&token=cce636e1-fb0f-4067-a521-ca5b32341f60"),
    ("IMG_1504.JPG", "surprise", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765878790949_IMG_1504.JPG?alt=media&token=4dfd245d-6803-4f0c-895a-8227489331a9"),
    ("IMG_1489.jpg", "anger", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765726354958_IMG_1489.jpg?alt=media&token=44baa553-906f-451a-b417-4c8c86d78e07"),
    ("IMG_1484.JPG", "sadness", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765726118584_IMG_1484.JPG?alt=media&token=0facb1e0-77ab-4de6-b202-8f132e5077ac"),
    ("83E3DEBD-8A3F-46C0-A193-15FFEC7F80A6.jpg", "anger", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765725257043_83E3DEBD-8A3F-46C0-A193-15FFEC7F80A6.jpg?alt=media&token=d5b38019-a663-436d-a9eb-27a0694e7900"),
    ("6fd35064-e773-46e1-a86c-eddd491d861d.jpg", "disgust", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765724803583_6fd35064-e773-46e1-a86c-eddd491d861d.jpg?alt=media&token=5ae70105-1489-4544-82fe-69bb21a75f13"),
    ("f92a4f66-012c-420a-9302-061007f552bf.jpg", "surprise", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765724789900_f92a4f66-012c-420a-9302-061007f552bf.jpg?alt=media&token=63e32c1c-92bf-4ebc-bae4-a576162f5fc3"),
    ("9c063d28-6122-4f3a-a6d2-d331421face2.jpg", "disgust", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765724779181_9c063d28-6122-4f3a-a6d2-d331421face2.jpg?alt=media&token=c0eb3292-2143-430d-b57d-99c62dd34d7f"),
    ("ec16bf7a-2fba-474c-82e2-9af200437540.jpg", "fear", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765724737743_ec16bf7a-2fba-474c-82e2-9af200437540.jpg?alt=media&token=ddac29d4-054d-4329-873e-575a6b94c67b"),
    ("ec209375-ab98-4d10-adf0-0217d2155618.jpg", "sadness", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765724718221_ec209375-ab98-4d10-adf0-0217d2155618.jpg?alt=media&token=aeda1cc3-e1bb-46c3-b396-0249981427ff"),
    ("1e170317-1469-48f9-b6c0-0ecf8bac9684.jpg", "disgust", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765724697479_1e170317-1469-48f9-b6c0-0ecf8bac9684.jpg?alt=media&token=e7cccba4-d393-41f9-b1bf-feabca5d8ca2"),
    ("eb094345-deb5-4644-86b8-17940ff0f340.jpg", "happiness", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765724676127_eb094345-deb5-4644-86b8-17940ff0f340.jpg?alt=media&token=311d94cb-4f58-4e91-a529-680ffec67c89"),
    ("dc058128-1cde-45a9-9637-c361c2fc9b7e.jpg", "surprise", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765724288806_dc058128-1cde-45a9-9637-c361c2fc9b7e.jpg?alt=media&token=f97d1132-ba2c-4b6a-b953-1fd334365baf"),
    ("a0a7ba49-152e-492b-83f9-3c1d290e7661.jpg", "surprise", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765724268739_a0a7ba49-152e-492b-83f9-3c1d290e7661.jpg?alt=media&token=7c71174d-3929-4df4-9666-c362bbd53fa2"),
    ("d31198ca-7f09-408c-be6e-02262ce99622.jpg", "anger", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765724256856_d31198ca-7f09-408c-be6e-02262ce99622.jpg?alt=media&token=1f83bb8c-b9e4-4f08-bf69-fb092af3fade"),
    ("12278282-b64e-4927-a590-20efa44cc1a4.jpg", "disgust", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765724245419_12278282-b64e-4927-a590-20efa44cc1a4.jpg?alt=media&token=f14f952e-de39-456e-9a8c-d4be69d9ceaa"),
    ("41d1b497-e5f4-4c18-9b82-481b56a5bebe.jpg", "sadness", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765724232023_41d1b497-e5f4-4c18-9b82-481b56a5bebe.jpg?alt=media&token=9e6b511c-096f-410d-bf60-62916425b0b7"),
    ("IMG_2636.jpg", "surprise", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765724202666_IMG_2636.jpg?alt=media&token=96656a8e-2e17-4265-91e5-94a52ba6a5f7"),
    ("IMG_1469.jpg", "happiness", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765723976547_IMG_1469.jpg?alt=media&token=d31124c9-51b2-47ec-a072-4c6b04075707"),
    ("IMG_2635.jpg", "disgust", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765723951924_IMG_2635.jpg?alt=media&token=6090537b-5beb-4266-b2ae-f59ae450a7e1"),
    ("IMG_1467.JPG", "surprise", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765723826562_IMG_1467.JPG?alt=media&token=410bc22c-5fb2-4882-a3af-b508dba52816"),
    ("IMG_2634.jpg", "happiness", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765723723022_IMG_2634.jpg?alt=media&token=1f39f99e-83f9-4386-91bf-126b84f77299"),
    ("df058dad-5973-4d35-b378-fdf501f8cb3d.jpg", "surprise", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765723692840_df058dad-5973-4d35-b378-fdf501f8cb3d.jpg?alt=media&token=04308e27-256e-4a8c-9a41-f48737b12606"),
    ("7.png", "happiness", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765723685564_7.png?alt=media&token=ac5e3dc2-717f-40da-a95e-f7abcddff195"),
    ("6.png", "happiness", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765723655958_6.png?alt=media&token=72c64d03-4ca2-4af4-a6cd-5f9955fcf24a"),
    ("5.png", "happiness", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765723635332_5.png?alt=media&token=71120ab8-3206-4e53-a3ea-f24417a0fa1c"),
    ("4.png", "anger", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765723590800_4.png?alt=media&token=1e6b9a95-cc63-471a-ae2a-3e4defeaedc1"),
    ("3.png", "sadness", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765723571327_3.png?alt=media&token=f9d6469d-6c39-42ef-808c-056ca700fe3e"),
    ("2.png", "fear", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765723544424_2.png?alt=media&token=983ab979-ef47-40c7-aae7-3d0a86205639"),
    ("1.png", "disgust", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765723524937_1.png?alt=media&token=29dfe10b-8389-4961-b676-508c440b64b2"),
    ("IMG_7941.JPG", "disgust", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765723442649_IMG_7941.JPG?alt=media&token=46f12b18-6c91-499f-849a-5289e3a93fb0"),
    ("IMG_1463.JPG", "happiness", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765721780087_IMG_1463.JPG?alt=media&token=a189c223-f5af-4fac-9008-1821f3317896"),
    ("IMG_1455.JPG", "surprise", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765721238859_IMG_1455.JPG?alt=media&token=a3d21ea9-eb3c-4ef7-ac8a-6d3ddc014a1c"),
    ("IMG_1448.JPG", "happiness", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765720728121_IMG_1448.JPG?alt=media&token=231b0f2e-b270-4a73-b3cb-2cc7483a0497"),
    ("IMG_1454.JPG", "fear", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765720716832_IMG_1454.JPG?alt=media&token=b94ffaae-9e55-4c5b-8ed7-31b08defb0ef"),
    ("IMG_1449.JPG", "disgust", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765720707049_IMG_1449.JPG?alt=media&token=37bb7ec9-3aa7-4ef9-82cc-aacabb1bfc51"),
    ("IMG_1445.JPG", "fear", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765720707049_IMG_1445.JPG?alt=media&token=6d016f37-24fa-44fc-94f2-bd58324c2da8"),
    ("IMG_1443.JPG", "sadness", "https://firebasestorage.googleapis.com/v0/b/nexus-emotions.firebasestorage.app/o/nexus%2F1765719318404_IMG_1443.JPG?alt=media&token=d1e8289e-c8d5-4d64-bfed-0fc6cbf693b0"),
]

EMOTION_COLORS = {
    "happiness": "#FFD600",
    "anger":     "#D32F2F",
    "disgust":   "#43A047",
    "sadness":   "#2979FF",
    "fear":      "#8E24AA",
    "surprise":  "#F06292",
}

dataset = [
    {"id": i, "filename": fn, "emotion": emo, "imageURL": url}
    for i, (fn, emo, url) in enumerate(FIREBASE_DATA)
]

# Printing total number of images for prototype dataset
print(f"Total images: {len(dataset)}")


"""
Standardising Images into Thumbnails for Mapping

- Crop all images into squares
- Compress into thumbnail sizes of 64 x 64 px

Extracting Features from the Dataset Images

- 55 images in this prototype dataset have 8 features (Shape of matrix is 55 x 8)
- Features include...
    1. red mean
    2. green mean
    3. blue mean
    4. red standard deviation
    5. green standard deviation
    6. blue standard deviation
    7. brightness mean
    8. saturation mean

"""

# Standardising Image Size
def center_square_crop(img):
    w, h = img.size
    side = min(w, h)
    left   = (w - side) // 2
    top    = (h - side) // 2
    right  = left + side
    bottom = top + side
    return img.crop((left, top, right, bottom))

# Extracting Features
def extract_features_and_thumb(image_url, thumb_size=(64, 64)):
    try:
        resp = requests.get(image_url, timeout=8)
        img = Image.open(BytesIO(resp.content)).convert("RGB")

        img_square = center_square_crop(img)
        img_feat = img_square.resize((64, 64))
        px = np.array(img_feat, dtype=np.float32) / 255.0

        # Colour Mean
        r_mean, g_mean, b_mean = px.mean(axis=(0, 1)) # Mean of RGB pixels
        r_std,  g_std,  b_std  = px.std(axis=(0, 1)) # Standard Deviation of RGB pixels

        # Brightness & Saturation Mean
        hsv = np.zeros_like(px)
        for i in range(px.shape[0]):
            for j in range(px.shape[1]):
                hsv[i, j] = colorsys.rgb_to_hsv(*px[i, j])
        _, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
        brightness_mean = v.mean()
        saturation_mean = s.mean()

        # Resize Images to 64 x 64 pixels
        thumb = img_square.resize(thumb_size)

        return [r_mean, g_mean, b_mean,
                r_std, g_std, b_std,
                brightness_mean, saturation_mean], thumb
    except Exception:
        blank = Image.new("RGB", thumb_size, (127, 127, 127))
        return [0.5, 0.5, 0.5,
                0.1, 0.1, 0.1,
                0.5, 0.5], blank

print("\nExtracting features and thumbnails...")
features, thumbnails = [], []
for d in dataset:
    f, thumb = extract_features_and_thumb(d["imageURL"])
    features.append(f)
    thumbnails.append(thumb)

features = np.array(features)
print("Feature matrix shape:", features.shape)
# Prints (55, 8) -> this means 55 images have 8 features per image


"""
Performing PCA 2D Mapping on the Dataset

- features refers to the shape of the matrix (55, 8)
- StandardScaler makes each of the 8 features have mean 0 and SD 1 -> Results in X
- fit_transform projects each 8D point into 2D -> Results in X2
- X2 has a shape of (55, 2) -> each row is the 2D PCA coordinate of one image
- Variance tells us how much of the original 8D variation is kept in the 2D mapping
- X2_norm is a rescaled version of X2 that finally gets used as 2D positions to place the images on the graph
"""


scaler = StandardScaler()
X = scaler.fit_transform(features)

pca = PCA(n_components=2, random_state=42)
X2 = pca.fit_transform(X)

print("\nPCA explained variance (PC1+PC2):",
      pca.explained_variance_ratio_.sum())

x_min, x_max = X2[:, 0].min(), X2[:, 0].max()
y_min, y_max = X2[:, 1].min(), X2[:, 1].max()
X2_norm = np.zeros_like(X2)
X2_norm[:, 0] = (X2[:, 0] - x_min) / (x_max - x_min + 1e-9)
X2_norm[:, 1] = (X2[:, 1] - y_min) / (y_max - y_min + 1e-9)

"""
Plotting Graph

- position based on colour & brightness of images in dataset that are similar
- Displays frame color as labelled emotion by user
"""

plt.style.use("dark_background")
fig, ax = plt.subplots(figsize=(10, 8))

for i, d in enumerate(dataset):
    x, y = X2_norm[i, 0], X2_norm[i, 1]
    img = thumbnails[i]
    emo = d["emotion"]

    ab = AnnotationBbox(
        OffsetImage(img, zoom=0.4),
        (x, y),
        frameon=True,
        bboxprops=dict(
            edgecolor=EMOTION_COLORS.get(emo, "white"),
            linewidth=2
        )
    )
    ax.add_artist(ab)

ax.set_xlim(-0.05, 1.05)
ax.set_ylim(-0.05, 1.05)
ax.set_xticks([])
ax.set_yticks([])
ax.set_title(
    "NEXUS – PCA 2D Mapping Prototype\n"
    "Position ≈ colour/brightness similarity, Frame colour = emotion",
    fontsize=16
)

handles = [
    mpatches.Patch(color=color, label=emo)
    for emo, color in EMOTION_COLORS.items()
]
ax.legend(handles=handles, loc="upper right", fontsize=8, framealpha=0.6)

plt.tight_layout()
plt.savefig("nexus_pca_map.png", dpi=300, facecolor="black")
plt.show()
