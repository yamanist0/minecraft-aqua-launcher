// resmi minecraft haberlerini ceker
#[tauri::command]
pub async fn get_news(page: Option<usize>) -> Option<serde_json::Value> {
    let page_num = page.unwrap_or(1);
    let url = format!(
        "https://net-secondary.web.minecraft-services.net/api/v1.0/en-us/search?page={}&pageSize=24&sortType=Recent&category=News&newsOnly=true&geography=TR",
        page_num
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .ok()?;

    let res = client.get(&url).send().await.ok()?;
    res.json::<serde_json::Value>().await.ok()
}
