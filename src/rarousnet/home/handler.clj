(ns rarousnet.home.handler
  (:require
    [compojure.core :refer [defroutes GET ANY]]
    [ring.util.response :refer [charset redirect]]))

(defn moved-permanently [location]
  (redirect location :moved-permanently))

(defn redirect-home [] (moved-permanently "/"))
(defn redirect-reference [] (moved-permanently "/webdesign/"))
(defn redirect-photos [] (moved-permanently "/photos/"))
(defn redirect-texy [] (moved-permanently "http://texy-rarous.rhcloud.com/ws/endpoint.php"))

(defroutes routes
  (GET "/contact" [] (redirect-home))
  (GET "/kontakt" [] (redirect-home))
  (GET "/default.aspx" [] (redirect-home))
  (GET "/about.aspx" [] (redirect-home))
  (GET "/stranky.aspx" [] (redirect-home))
  (GET "/odkazy.aspx" [] (redirect-home))
  (GET "/skola.aspx" [] (redirect-home))
  (GET "/Default.aspx" [] (redirect-home))
  (GET "/reference.aspx" [] (redirect-reference))
  (GET "/weblog/reference.aspx" [] (redirect-reference))
  (GET "/weblog/projekty.aspx" [] (redirect-reference))
  (GET "/webdesign" [] (redirect-reference))
  (GET "/galerie.aspx" [] (redirect-photos))
  (GET "/Galerie.aspx" [] (redirect-photos))
  (GET "/galerie/:url" [] (redirect-photos))
  (GET "/photos" [] (redirect-photos))
  (ANY "/texy-ws/endpoint.php" [] (redirect-texy)))
