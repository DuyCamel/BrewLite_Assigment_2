UPDATE products
SET image_url = CASE id
  WHEN 'ca-phe-sua' THEN '/images/products/ca-phe-sua.jpg'
  WHEN 'bac-xiu' THEN '/images/products/bac_xiu.webp'
  WHEN 'americano' THEN '/images/products/americano.jpg'
  WHEN 'latte' THEN '/images/products/latte-da.jpg'
  WHEN 'tra-dao' THEN '/images/products/tra_dao_cam_sa.jpg'
  WHEN 'tra-vai' THEN '/images/products/tra_vai.jpg'
  WHEN 'matcha-latte' THEN '/images/products/matcha_latte.jpg'
  WHEN 'chocolate' THEN '/images/products/choco_latte.jpg'
  WHEN 'espresso' THEN '/images/products/espresso.jpg'
  WHEN 'cappuccino' THEN '/images/products/cappuchino.jpg'
  WHEN 'ca-phe-den' THEN '/images/products/cafe_den.webp'
  WHEN 'cold-brew' THEN '/images/products/cold_brew.jpg'
  WHEN 'caramel-latte' THEN '/images/products/caramel_latte.jpg'
  WHEN 'vanilla-latte' THEN '/images/products/Vanilla_Latte.jpg'
  WHEN 'mocha' THEN '/images/products/mocha.jpg'
  WHEN 'ca-phe-dua' THEN '/images/products/cafe_dua.jpeg'
  WHEN 'tra-chanh' THEN '/images/products/tra_chanh.jpg'
  WHEN 'tra-tac' THEN '/images/products/tra_tac.jpg'
  WHEN 'tra-dau' THEN '/images/products/tra_dau.jpg'
  WHEN 'tra-xoai' THEN '/images/products/tra_xoai.jpg'
  WHEN 'tra-chanh-day' THEN '/images/products/tra_chanh_day.webp'
  WHEN 'tra-oi-hong' THEN '/images/products/tra_oi_hong.png'
  WHEN 'tra-sen' THEN '/images/products/trasen.jpg'
  WHEN 'tra-luu' THEN '/images/products/tra_luu.jpg'
  WHEN 'matcha-da' THEN '/images/products/matcha_da_xay.png'
  WHEN 'matcha-espresso' THEN '/images/products/matcha_espresso.png'
  WHEN 'cacao-nong' THEN '/images/products/cacao_nong.jpg'
  WHEN 'sua-tuoi' THEN '/images/products/sua.jpg'
  WHEN 'sua-tuoi-tran-chau' THEN '/images/products/sua_tuoi_tran_chau.jpeg'
  WHEN 'soda-chanh' THEN '/images/products/soda_chanh.webp'
  WHEN 'soda-viet-quat' THEN '/images/products/soda_vietquoc.jpg'
  WHEN 'nuoc-cam' THEN '/images/products/cam_ep.jpg'
  WHEN 'nuoc-dua' THEN '/images/products/nuoc_dua.webp'
  WHEN 'yogurt-dau' THEN '/images/products/sua_chua_dau.jpg'
  WHEN 'yogurt-xoai' THEN '/images/products/sua_chua_xoai.png'
  WHEN 'nuoc-suoi' THEN '/images/products/nuoc_khoang.jpg'
  ELSE image_url
END
WHERE id IN (
  'ca-phe-sua', 'bac-xiu', 'americano', 'latte', 'tra-dao', 'tra-vai',
  'matcha-latte', 'chocolate', 'espresso', 'cappuccino', 'ca-phe-den',
  'cold-brew', 'caramel-latte', 'vanilla-latte', 'mocha', 'ca-phe-dua',
  'tra-chanh', 'tra-tac', 'tra-dau', 'tra-xoai', 'tra-chanh-day',
  'tra-oi-hong', 'tra-sen', 'tra-luu', 'matcha-da', 'matcha-espresso',
  'cacao-nong', 'sua-tuoi', 'sua-tuoi-tran-chau', 'soda-chanh',
  'soda-viet-quat', 'nuoc-cam', 'nuoc-dua', 'yogurt-dau', 'yogurt-xoai',
  'nuoc-suoi'
);
