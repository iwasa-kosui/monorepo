resource "aws_lightsail_instance" "microblog" {
  name              = "microblog"
  availability_zone = "ap-northeast-1a"
  blueprint_id     = "amazon_linux_2023"
  bundle_id        = "small_3_0"

  ip_address_type = "ipv4"

  tags = {
    Name = "microblog"
  }
}
